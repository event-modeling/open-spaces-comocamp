require 'ostruct'

class UniqueIdProvidedEvent < OpenStruct
  def initialize(confId, qr, url, timestamp, id)
    super(confId: confId, qr: qr, url: url, timestamp: timestamp, id: id, type: 'UniqueIdProvidedEvent')
  end
end
