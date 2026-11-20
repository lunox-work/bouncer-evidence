"""Duration strings: parse short strings such as `1h30m` or `250ms` into whole
milliseconds and format milliseconds back into the shortest such string."""


def parse_duration(text: str) -> int:
    """Turn a duration string into whole milliseconds.

    Raises ValueError whose message contains "duration" if the text is not a
    duration, or if its total exceeds 9007199254740991 ms.
    """
    raise NotImplementedError("not implemented")


def format_duration(ms: int) -> str:
    """Turn milliseconds back into the shortest duration string that parses back.

    Raises ValueError whose message contains "milliseconds" for any value that
    is not an int from 0 to 9007199254740991 (including a bool or a float).
    """
    raise NotImplementedError("not implemented")
