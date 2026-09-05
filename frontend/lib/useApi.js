'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from './api'

/** Simple GET-and-hold hook for a single resource (dashboard, a report, one record). */
export function useApiGet(path, params, { skip = false } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(!skip)
  const [error, setError] = useState(null)

  const key = JSON.stringify(params)

  const reload = useCallback(async () => {
    if (skip || !path) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.get(path, params)
      setData(result)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key, skip])

  useEffect(() => {
    reload()
  }, [reload])

  return { data, loading, error, reload }
}

/** List hook with search + pagination state, matching every masters/documents endpoint's { rows, total } shape. */
export function useApiList(path, { pageSize = 25, extraParams = {} } = {}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const extraKey = JSON.stringify(extraParams)

  const { data, loading, error, reload } = useApiGet(path, {
    q: search || undefined,
    page,
    pageSize,
    ...extraParams,
  })

  // reset to page 1 whenever the search or filters change
  useEffect(() => {
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, extraKey])

  return {
    rows: data?.rows ?? [],
    total: data?.total ?? 0,
    page,
    pageSize,
    setPage,
    search,
    setSearch,
    loading,
    error,
    reload,
  }
}
