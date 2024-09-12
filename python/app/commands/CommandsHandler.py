from commands.request_payment import RequestPaymentCD
from events.payment_requested import PaymentRequested
from events_store.events_store import EventStore


class CommandsHandler:
    def request_payment_command(
            self, event_id: str, timestamp: str, command: RequestPaymentCD
    ):
        """
        Command handler for request payment

        :param timestamp:
        :param event_id:
        :param command:
        :return:
        """
        if not command.amount:
            return {
                'message': 'Amount is required'
            }
        if not command.conference:
            return {
                'message': 'Conference is required'
            }
        if not command.username:
            return {
                'message': 'Username is required'
            }
        if not command.name:
            return {
                'message': 'Name is required'
            }
        EventStore.write_event_if_id_not_exists(
            PaymentRequested(**{
                'type': 'PaymentRequested',
                'id': event_id,
                'timestamp': timestamp,
                'amount': command.amount,
                'currency': command.currency,
                'conference': command.conference,
                'username': command.username,
                'name': command.name
            })
        )
