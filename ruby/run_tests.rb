require_relative 'app'
require 'time'

def run_tests
  def log_result(expected, result)
    puts "Expected: #{expected}, Got: #{result}"
  end

  def assert_object_equal(expected, actual)
    if expected.to_json != actual.to_json
      raise "Assertion failed: expected #{expected.to_json}, got #{actual.to_json}"
    end
  end

  command_time_stamp = Time.parse("2024-05-21T00:00:00.000Z").iso8601
  command_uuid = "fceee960-2f9f-47b0-ad19-fed15d4f82cb"
  test_events = [
    UniqueIdProvidedEvent.new("6ceee960-2f9f-47b0-ad19-fed15d4f82c1", "<svg>...</svg>", "http://localhost:3000/register/6ceee960-2f9f-47b0-ad19-fed15d4f82c1", "2024-05-26T00:00:00.000Z", "6ceee960-2f9f-47b0-ad19-fed15d4f82c1")
  ]

  slices = [
    {
      name: "ConferenceIdsSV",
      tests: [
        {
          name: "ConferenceIdsSV should return all ConferenceId events",
          test: -> {
            expected = {conf_id: "6ceee960-2f9f-47b0-ad19-fed15d4f82c1", qr: "<svg>...</svg>", url: "http://localhost:3000/register/6ceee960-2f9f-47b0-ad19-fed15d4f82c1"}
            result = conference_ids_sv(test_events)
            assert_object_equal(expected, result.last)
            true
          }
        }
      ]
    }
  ]

  slices.each do |slice|
    puts "\e[42;97m\e[1m#{slice[:name]} slice tests:\e[0m"
    slice[:tests].each do |test|
      begin
        puts "Test " + (test[:test].call ? '✅ ' : '❌ ') + test[:name]
      rescue => error
        puts '❌ ' + test[:name] + ' had error: ' + error
      end
    end
  end
end

if __FILE__ == $0
  run_tests
end