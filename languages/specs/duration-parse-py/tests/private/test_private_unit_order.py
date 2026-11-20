"""R2 (hidden): units run from largest to smallest, each at most once."""
import pytest

from src.solution import parse_duration


# happy 2: A count may exceed the next unit

# extends test_happy_2__ninety_minutes: other units over their next size
def test_happy_2__seconds_over_a_minute():
    assert parse_duration("61s") == 61000


def test_happy_2__ms_over_a_second():
    assert parse_duration("1500ms") == 1500


def test_happy_2__minutes_over_a_day():
    assert parse_duration("1441m") == 86460000


# extends test_happy_2__ninety_minutes_equals_one_hour_thirty
def test_happy_2__overflowing_counts_in_several_components():
    assert parse_duration("25h61m61s1001ms") == parse_duration("1d2h2m2s1ms")


def test_happy_2__overflowing_counts_value():
    assert parse_duration("25h61m61s1001ms") == 93722001


# extends test_happy_2__hours_count_reaching_a_full_day
def test_happy_2__many_hours():
    assert parse_duration("1000h") == 3600000000


def test_happy_2__day_and_overflowing_hours():
    assert parse_duration("1d48h") == 259200000


# unhappy 2: Out-of-order or repeated units are rejected

def test_unhappy_2__spec_examples_all_rejected():
    for text in ["30m1h", "1h1h", "1s500ms2s", "5ms1s"]:
        with pytest.raises(ValueError, match="duration"):
            parse_duration(text)


# extends test_unhappy_2__rejects_repeated_hours: every unit repeated
def test_unhappy_2__rejects_repeated_days():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1d1d")


def test_unhappy_2__rejects_repeated_minutes():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1m1m")


def test_unhappy_2__rejects_repeated_seconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1s1s")


def test_unhappy_2__rejects_repeated_milliseconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1ms1ms")


def test_unhappy_2__rejects_repeat_separated_by_other_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h1m1h")


# extends test_unhappy_2__rejects_minutes_before_hours: other inversions
def test_unhappy_2__rejects_hours_before_days():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h1d")


def test_unhappy_2__rejects_seconds_before_minutes():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1s1m")


def test_unhappy_2__rejects_ms_before_days():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1ms1d")


def test_unhappy_2__rejects_fully_reversed():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1ms1s1m1h1d")


# inversion that is not adjacent and has no repeated unit
def test_unhappy_2__rejects_non_adjacent_inversion():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1d1s1m")


def test_unhappy_2__rejects_inversion_at_end():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1d1h1m1s1ms1h")


# extends test_unhappy_2__rejects_repeated_zero_component
def test_unhappy_2__rejects_zero_component_out_of_order():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("0ms0s")


def test_unhappy_2__rejects_repeated_zero_days():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h0h")
