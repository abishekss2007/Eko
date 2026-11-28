"""A small in-process TTL + LRU cache (no external store needed on a single instance)."""

import time
from collections import OrderedDict
from collections.abc import Callable, Hashable


class TTLCache[K: Hashable, V]:
    """Entries expire after `ttl_s` seconds; the least recently used is evicted past `maxsize`."""

    def __init__(self, ttl_s: float, maxsize: int = 256, clock: Callable[[], float] = time.monotonic) -> None:
        self._ttl = ttl_s
        self._maxsize = maxsize
        self._clock = clock
        self._data: OrderedDict[K, tuple[float, V]] = OrderedDict()

    def get(self, key: K) -> V | None:
        item = self._data.get(key)
        if item is None:
            return None
        expires, value = item
        if self._clock() >= expires:
            del self._data[key]
            return None
        self._data.move_to_end(key)
        return value

    def set(self, key: K, value: V) -> None:
        if self._ttl <= 0:
            return
        self._data[key] = (self._clock() + self._ttl, value)
        self._data.move_to_end(key)
        while len(self._data) > self._maxsize:
            self._data.popitem(last=False)

    def __len__(self) -> int:
        return len(self._data)
