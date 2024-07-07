require 'sinatra'
require "sinatra/reloader" if development?
require 'json'
require 'fileutils'
require 'ostruct'

require_relative 'events/unique_id_provided_event'

EVENT_STORE_PATH = File.expand_path(File.join(__dir__, '..', 'eventstore'))
def write_event_if_id_not_exists(event) Dir.mkdir(EVENT_STORE_PATH) unless Dir.exist?(EVENT_STORE_PATH); event_files = Dir.entries(EVENT_STORE_PATH).select { |file| file.include?(event.id) }; if event_files.empty? then timestamp = event.timestamp.gsub(':', '-').gsub(/\..+/, ''); file_name = "#{timestamp}-#{event.id}-#{event.type}.json"; File.write(File.join(EVENT_STORE_PATH, file_name), JSON.generate(event.to_h)) end end
def get_all_events; Dir.mkdir(EVENT_STORE_PATH) unless Dir.exist?(EVENT_STORE_PATH); Dir.entries(EVENT_STORE_PATH).select { |file| file.end_with?('.json') }.map { |file| OpenStruct.new(JSON.parse(File.read(File.join(EVENT_STORE_PATH, file)))) }; end

get '/portal_management' do erb :portal_management, locals: { conference_id: conference_ids_sv(get_all_events).last } end
def conference_ids_sv(events_array)
  events_array.select { |event| event.type == 'UniqueIdProvidedEvent' }.sort_by { |event| event.timestamp }.reverse.map { |event| { conf_id: event.confId, qr: event.qr, url: event.url } }
end