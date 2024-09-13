from commands.CommandsHandler import CommandsHandler


def test_open_registration_command():
    """
    Test the open registration command
    :return:
    """
    conference_id = '2b7f0674-5e6f-4c5a-896b-c9c496841091'
    event_id = '2b7f0674-5e6f-4c5a-896b-c9c496841091'
    timestamp = '2021-10-10T10:00:00'
    handler = CommandsHandler()
    result = handler.open_registration_command(event_id, timestamp, conference_id)
    assert result is True
