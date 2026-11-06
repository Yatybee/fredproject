import { createContext, useContext } from 'react'

/** Unread-alert count, provided by Layout and read by the header tools. */
export const UnreadContext = createContext(0)
export const useUnread = () => useContext(UnreadContext)
