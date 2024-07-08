require 'ostruct'

class CloseRegistrationCD < OpenStruct
  def initialize(confId, timestamp, id)
    super(confId: confId, timestamp: timestamp, id: id, type: 'CloseRegistrationCD')
  end
end

