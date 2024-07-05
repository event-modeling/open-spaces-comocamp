require 'sinatra'
require "sinatra/reloader" if development?

get '/' do
  "Hello world!"
end