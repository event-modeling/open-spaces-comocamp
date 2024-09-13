require 'ostruct'

class OpenRegistrationCmd < OpenStruct
  def initialize(confId, timestamp, id)
    super(confId: confId, timestamp: timestamp, id: id, type: 'OpenRegistrationCmd')
  end
end
