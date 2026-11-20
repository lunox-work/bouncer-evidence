"""R2: units run from largest to smallest, each at most once."""
import pytest

from src.solution import parse_duration


# happy 2: A count may exceed the next unit

def test_happy_2__ninety_minutes():
    assert parse_duration("90m") == 5400000


def test_happy_2__ninety_minutes_equals_one_hour_thirty():
    assert parse_duration("90m") == parse_duration("1h30m")


def test_happy_2__milliseconds_count_reaching_a_full_second():
    assert parse_duration("1s1000ms") == 2000


def test_happy_2__hours_count_reaching_a_full_day():
    assert parse_duration("24h") == 86400000


# unhappy 2: Out-of-order or repeated units are rejected

def test_unhappy_2__rejects_minutes_before_hours():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("30m1h")


def test_unhappy_2__rejects_repeated_hours():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h1h")


def test_unhappy_2__rejects_seconds_repeated_around_ms():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1s500ms2s")


def test_unhappy_2__rejects_milliseconds_before_seconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("5ms1s")


def test_unhappy_2__rejects_repeated_zero_component():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("0s0s")


def test_unhappy_2__rejects_milliseconds_before_minutes():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1ms1m")
