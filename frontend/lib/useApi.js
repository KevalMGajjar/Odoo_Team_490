'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { useDebouncedValue } from './useDebouncedValue'

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

  // The input stays instant; only the request waits. Without this every
  // keystroke fired its own request.
  const debouncedSearch = useDebouncedValue(search, 300)

  const { data, loading, error, reload } = useApiGet(path, {
    q: debouncedSearch || undefined,
    page,
    pageSize,
    ...extraParams,
  })

  // reset to page 1 whenever the search or filters change
  useEffect(() => {
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, extraKey])

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
