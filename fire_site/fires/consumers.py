from channels.generic.websocket import AsyncJsonWebsocketConsumer


class FireConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.group_name = 'fires'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        try:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        except Exception:
            pass

    async def receive_json(self, content, **kwargs):
        # read-only stream for now; ignore client messages
        return

    async def fire_created(self, event):
        # called when group_send with type 'fire.created' maps to method name with dot -> underscore
        data = event.get('event')
        if data:
            await self.send_json(data)

    # route type name 'fire.created' to this handler
    async def fire_created_handler(self, event):
        await self.fire_created(event)


