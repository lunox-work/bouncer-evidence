"""Duration strings: parse short strings such as `1h30m` or `250ms` into whole
milliseconds and format milliseconds back into the shortest such string."""

import re

MAX_MS = 9007199254740991  # 2**53 - 1

# Units from largest to smallest, with their size in milliseconds.
_UNITS = (("d", 86_400_000), ("h", 3_600_000), ("m", 60_000), ("s", 1_000), ("ms", 1))
_RANK = {name: i for i, (name, _) in enumerate(_UNITS)}
_SIZE = dict(_UNITS)
_MAX_DIGITS = len(str(MAX_MS))

# "ms" must be tried before "m" and "s".
_COMPONENT = re.compile(r"(0|[1-9][0-9]*)(ms|d|h|m|s)")


def parse_duration(text: str) -> int:
    """Turn a duration string into whole milliseconds.

    Raises ValueError whose message contains "duration" if the text is not a
    duration, or if its total exceeds 9007199254740991 ms.
    """
    if not isinstance(text, str):
        raise ValueError(f"invalid duration: expected a string, got {type(text).__name__}")
    body = text.strip()
    if not body:
        raise ValueError("invalid duration: empty string")

    total = 0
    pos = 0
    last_rank = -1
    while pos < len(body):
        match = _COMPONENT.match(body, pos)
        if match is None:
            raise ValueError(f"invalid duration: {text!r}")
        count, unit = match.group(1), match.group(2)
        rank = _RANK[unit]
        if rank <= last_rank:
            raise ValueError(
                f"invalid duration: {text!r} (units must run from largest to "
                f"smallest, each at most once)"
            )
        last_rank = rank
        # Any count longer than MAX_MS's digits exceeds the limit on its own;
        # checking first also avoids int()'s digit-count limit on huge input.
        if len(count) > _MAX_DIGITS:
            raise ValueError(f"duration {text!r} exceeds {MAX_MS} ms")
        total += int(count) * _SIZE[unit]
        if total > MAX_MS:
            raise ValueError(f"duration {text!r} exceeds {MAX_MS} ms")
        pos = match.end()
    return total


def format_duration(ms: int) -> str:
    """Turn milliseconds back into the shortest duration string that parses back.

    Raises ValueError whose message contains "milliseconds" for any value that
    is not an int from 0 to 9007199254740991 (including a bool or a float).
    """
    if not isinstance(ms, int) or isinstance(ms, bool):
        raise ValueError(f"milliseconds must be an int, got {type(ms).__name__}")
    if ms < 0 or ms > MAX_MS:
        raise ValueError(f"milliseconds must be from 0 to {MAX_MS}, got {ms}")
    if ms == 0:
        return "0ms"
    parts = []
    rest = int(ms)
    for name, size in _UNITS:
        count, rest = divmod(rest, size)
        if count:
            parts.append(f"{count}{name}")
    return "".join(parts)
