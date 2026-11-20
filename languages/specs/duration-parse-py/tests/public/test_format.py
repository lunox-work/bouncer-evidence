"""R4: formatting gives the shortest string that parses back."""
import pytest

from src.solution import format_duration, parse_duration


# happy 3: Formatting

def test_happy_3__zero_is_0ms():
    assert format_duration(0) == "0ms"


def test_happy_3__milliseconds():
    assert format_duration(250) == "250ms"


def test_happy_3__minutes_and_seconds():
    assert format_duration(90000) == "1m30s"


def test_happy_3__hours_and_minutes():
    assert format_duration(5400000) == "1h30m"


def test_happy_3__one_day():
    assert format_duration(86400000) == "1d"


def test_happy_3__every_unit():
    assert format_duration(90061001) == "1d1h1m1s1ms"


def test_happy_3__one_millisecond():
    assert format_duration(1) == "1ms"


def test_happy_3__inner_zero_components_left_out():
    assert format_duration(86400001) == "1d1ms"


def test_happy_3__one_second():
    assert format_duration(1000) == "1s"


# boundary 3: Formatting the largest value

def test_boundary_3__largest_value():
    assert format_duration(9007199254740991) == "104249991d8h59m991ms"


def test_boundary_3__one_below_largest_value():
    assert format_duration(9007199254740990) == "104249991d8h59m990ms"


# boundary 4: Formatting then parsing gives the number back

def test_boundary_4__round_trip():
    assert parse_duration(format_duration(123456789)) == 123456789


def test_boundary_4__round_trip_text():
    assert format_duration(123456789) == "1d10h17m36s789ms"


def test_boundary_4__round_trip_zero():
    assert parse_duration(format_duration(0)) == 0


def test_boundary_4__round_trip_largest():
    assert parse_duration(format_duration(9007199254740991)) == 9007199254740991


# unhappy 4: Out-of-range values are rejected

def test_unhappy_4__rejects_negative():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(-1)


def test_unhappy_4__rejects_one_above_largest():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(9007199254740992)


def test_unhappy_4__rejects_true():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(True)


def test_unhappy_4__rejects_float():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(1.0)


def test_unhappy_4__rejects_false():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(False)


def test_unhappy_4__rejects_numeric_string():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration("100")


def test_unhappy_4__rejects_none():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(None)
