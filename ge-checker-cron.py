#!/usr/bin/python

# Note: for setting up email with sendmail, see: http://linuxconfig.org/configuring-gmail-as-sendmail-email-relay

from subprocess import check_output
from datetime import datetime
from os import path
import sys, smtplib, json
from email.mime.text import MIMEText

PWD = path.dirname(sys.argv[0])
if PWD == '':
    PWD = '.'
# Get settings
try:
    with open('%s/config.json' % PWD) as json_file:
        settings = json.load(json_file)
except Exception as e:
    print 'Error extracting config file: %s' % e
    sys.exit()

# Make sure we have all our settings
if not 'email_from' in settings or not settings['email_from']:
    print 'Missing from address in config'
    sys.exit()
if not 'email_to' in settings or not settings['email_to']:
    print 'Missing to address in config'
    sys.exit()
if not 'init_url' in settings or not settings['init_url']:
    print 'Missing initial URL in config'
    sys.exit()
if not 'enrollment_location_id' in settings or not settings['enrollment_location_id']:
    print 'Missing enrollment_location_id in config'
    sys.exit()
if not 'username' in settings or not settings['username']:
    print 'Missing username in config'
    sys.exit()
if not 'password' in settings or not settings['password']:
    print 'Missing password in config'
    sys.exit()


def log(msg):
    print msg

    if not 'logfile' in settings or not settings['logfile']: return
    with open(settings['logfile'], 'a') as logfile:
        logfile.write('%s: %s\n' % (datetime.now(), msg))

def send_apt_available_email(current_apt, avail_apt):
    message = """<p>Good news! There's a new Global Entry appointment available on <b>%s</b> (your current appointment is on %s).</p>

<p>If this sounds good, please sign in to https://goes-app.cbp.dhs.gov/main/goes to reschedule.</p>
""" % (avail_apt.strftime('%B %d, %Y'), current_apt.strftime('%B %d, %Y'))

    try:
        msg = MIMEText(message, 'html')
        msg['Subject'] = "Alert: New Global Entry Appointment Available"
        msg['To'] = ", ".join(settings['email_to'])
        msg['From'] = settings['email_from']

        server = smtplib.SMTP(settings['smtp_server'], settings['smtp_port'])
        server.starttls()
        server.login(settings['smtp_user'], settings['smtp_pw'])
        server.sendmail(settings['email_from'], settings['email_to'], msg.as_string())
        server.quit()
    except Exception as e:
        log('Failed to send success email {}'.format(e))

new_apt_str = check_output(['/usr/local/bin/phantomjs', '%s/ge-cancellation-checker.phantom.js' % PWD]); # get string from PhantomJS script - formatted like 'July 20, 2015'

new_apt_str = new_apt_str.strip()
new_apt_str, old_apt_str = new_apt_str.split("\n")

try: new_apt = datetime.strptime(new_apt_str, '%H:%M %B %d, %Y')
except ValueError as e:
    log('not valid date: %s' % new_apt_str)
    sys.exit()

try: old_apt = datetime.strptime(old_apt_str, '%H:%M %b %d, %Y')
except ValueError as e:
    log('not valid old date: %s' % old_apt_str)
    sys.exit()

if new_apt < old_apt: # new appointment is newer than existing!
    send_apt_available_email(old_apt, new_apt)
    log('Found new appointment on %s (current is on %s)!' % (new_apt, old_apt))
else:
    log('No new appointments. Next available on %s (current is on %s)' % (new_apt, old_apt))
