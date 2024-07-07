require_relative '../events/unique_id_provided_event'
require_relative '../app'
require 'securerandom'
require 'rqrcode'
require 'json'

conf_id = SecureRandom.uuid
qr = RQRCode::QRCode.new("http://localhost:3000/register/#{conf_id}").as_svg(module_size: 4)
url = "http://localhost:3000/register/#{conf_id}"
fake_event = UniqueIdProvidedEvent.new(conf_id, qr, url, Time.now.utc.iso8601, SecureRandom.uuid)
write_event_if_id_not_exists(fake_event)

puts "Fake event created and stored."


