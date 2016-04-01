
// CLI usage:
// phantomjs [--ssl-protocol=any] goes-checker.js [-v|--verbose]

var system = require('system');
var fs = require('fs');

var VERBOSE = false;

// Calculate path of this file
var PWD = '';
var current_path_arr = system.args[0].split('/');
if (current_path_arr.length == 1) { PWD = '.'; }
else {
    current_path_arr.pop();
    PWD = current_path_arr.join('/');
}
var current_scheduled_date = '';
// Gather Settings...
try {
    var settings = JSON.parse(fs.read(PWD + '/config.json'));
    if (!settings.username || !settings.username || !settings.init_url || !settings.enrollment_location_id) {
        console.log('Missing username, password, enrollment location ID, and/or initial URL. Exiting...');
        phantom.exit();
    }
}
catch(e) {
    console.log('Could not find config.json');
    phantom.exit();
}

// ...from command
system.args.forEach(function(val, i) {
    if (val == '-v' || val == '--verbose') { VERBOSE = true; }
});

var page = require('webpage').create();

page.onConsoleMessage = function(msg) {
    if (!VERBOSE) { return; }
    console.log(msg);
};

page.onError = function(msg, trace) {
    if (!VERBOSE) { return; }
    console.error('Error on page: ' + msg);
}

page.onCallback = function(query, msg) {
    if (query == 'username') { return settings.username; }
    if (query == 'password') { return settings.password; }
    if (query == 'enrollment_location_id') { return settings.enrollment_location_id; }
    if (query == 'scheduled_date') {
      current_scheduled_date = msg;
      return;
    }
    if (query == 'report-interview-time') {
        if (VERBOSE) {
          console.log('Next available appointment is at: ' + msg);
          console.log('Current appointment is at: ' + current_scheduled_date);
        }
        else {
          console.log(msg);
          console.log(current_scheduled_date);
        }
        return;
    }
    if (query == 'fatal-error') {
        console.log('Fatal error: ' + msg);
        phantom.exit();
    }
    return null;
}


var steps = [
    function() { // Log in
        page.evaluate(function() {
            console.log('On GOES login page...');
            document.querySelector('input[name=username]').value = window.callPhantom('username');
            document.querySelector('input[name=password]').value = window.callPhantom('password');
            document.querySelector('form[action="/pkmslogin.form"]').submit();
            console.log('Logging in...');
        });
    },
    function() { // Accept terms
        page.evaluate(function() {

            function fireClick(el) {
                var ev = document.createEvent("MouseEvents");
                ev.initEvent("click", true, true);
                el.dispatchEvent(ev);
            }

            var $acceptTermsBtn = document.querySelector('a[href="/main/goes/HomePagePreAction.do"]');

            if (!$acceptTermsBtn) {
                return window.callPhantom('fatal-error', 'Unable to find terms acceptance button');
            }

            fireClick($acceptTermsBtn);
            console.log('Accepting terms...');
        });
    },
    function() { // main dashboard
        page.evaluate(function() {
            function fireClick(el) {
                var ev = document.createEvent("MouseEvents");
                ev.initEvent("click", true, true);
                el.dispatchEvent(ev);
            }

            var $manageAptBtn = document.querySelector('.bluebutton[name=manageAptm]');
            if (!$manageAptBtn) {
                return window.callPhantom('fatal-error', 'Unable to find Manage Appointment button');
            }

            fireClick($manageAptBtn);
            console.log('Entering appointment management...');
        });
    },
    function() {

        page.evaluate(function() {
            function fireClick(el) {
                var ev = document.createEvent("MouseEvents");
                ev.initEvent("click", true, true);
                el.dispatchEvent(ev);
            }

            var csd = jQuery('strong:contains("Interview Date")').parent().clone().children().remove().end().text().trim();
            var cst = jQuery('strong:contains("Interview Time")').parent().clone().children().remove().end().text().trim();

            window.callPhantom('scheduled_date', cst + ' ' + csd);
            var $rescheduleBtn = document.querySelector('input[name=reschedule]');

            if (!$rescheduleBtn) {
                return window.callPhantom('fatal-error', 'Unable to find reschedule button. Is it after or less than 24 hrs before your appointment?');
            }

            fireClick($rescheduleBtn);
            console.log('Entering rescheduling selection page...');
        });
    },
    function() {
        page.evaluate(function() {
            var locid = window.callPhantom('enrollment_location_id').toString();

            $('#selectedEnrollmentCenter')[0].value = locid;
            $('input[name=next]')[0].click();
            console.log('Choosing SFO...');
        });
    },
    function() {
        page.evaluate(function() {
            // We made it! Now we have to scrape the page for the earliest available date
            var day = $('.currentDayCell')[0].textContent;
            var month_year = $('.yearMonthHeader :nth-child(2)')[0].textContent;
            var first_time = $('a.entry').first().text();

            var full_date = first_time + ' ' + month_year.replace(' ', ' ' + day + ', ');
            window.callPhantom('report-interview-time', full_date)
        });
    }
];

var phantom_state = 'start';

page.onLoadFinished = function(status) {
  if (status === 'success') {
    page.includeJs("https://ajax.googleapis.com/ajax/libs/jquery/1.12.2/jquery.min.js", function() {
      if (phantom_state == 'start') {
        steps[0]();
        phantom_state = 'accept';
      }
      else if (phantom_state == 'accept') {
        steps[1]();
        phantom_state = 'main';
      }
      else if (phantom_state == 'main') {
        steps[2]();
        phantom_state = 'current_interview';
      }
      else if (phantom_state == 'current_interview') {
        steps[3]();
        phantom_state = 'enrollment_center';
      }
      else if (phantom_state == 'enrollment_center') {
        steps[4]();
        phantom_state = 'get_date';
      }
      else if (phantom_state == 'get_date') {
        steps[5]();
        phantom.exit();
      }
    });
  }
};

if (VERBOSE) { console.log('Please wait...'); }

page.open(settings.init_url);
