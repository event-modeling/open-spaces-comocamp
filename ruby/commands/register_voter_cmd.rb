require 'ostruct'

class RegisterVoterCmd < OpenStruct
  def initialize(conferenceId, timestamp, id, username)
    # generate a unique user id
    super(conferenceId: conferenceId, timestamp: timestamp, id: id, username: username, userId: SecureRandom.uuid, type: 'RegisterVoterCmd')
  end
end
