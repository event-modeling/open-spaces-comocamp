require 'ostruct'

class RegistrationOpenedEvent < OpenStruct
  def initialize(confId, timestamp, id)
    super(confId: confId, timestamp: timestamp, id: id, type: 'RegistrationOpenedEvent')
  end
end
