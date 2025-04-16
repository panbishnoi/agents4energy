"use client"

import Page from './workorderlist/page'
import { withAuth } from '@/components/WithAuth'

function Home() {
  return (
    <Page />
  )
}

export default withAuth(Home)