import * as React from 'react'

class DummyEventBus {
  subscribe(event, callback) {}
  dispatch(event) {}
}

export const EventBusContext = React.createContext(new DummyEventBus())

export const useEventBus = () => React.useContext(EventBusContext)
