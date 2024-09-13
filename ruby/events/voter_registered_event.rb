require 'ostruct'

class VoterRegisteredEvent < OpenStruct
  def initialize(conferenceId, timestamp, id, userId, username)
    super(conferenceId: conferenceId, timestamp: timestamp, id: id, userId: userId, username: username, type: 'VoterRegisteredEvent')
  end
end
