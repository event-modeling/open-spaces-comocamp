require 'ostruct'

class RegistrationClosedEvent < OpenStruct
  def initialize(confId, timestamp, id)
    super(confId: confId, timestamp: timestamp, id: id, type: 'RegistrationClosedEvent')
  end
end

