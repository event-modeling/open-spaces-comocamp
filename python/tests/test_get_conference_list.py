from read_models.hosted_conferences import HostedConferencesList


def test_get_conference_list():
    """
    Test the get conference list
    :return:
    """
    conference_id = '2b7f0674-5e6f-4c5a-896b-c9c496841091'
    result = HostedConferencesList.get_data(conference_id)
    assert result.get('conference_id') == conference_id
    assert result.get('time_slots') == '8 AM - 9 AM'
