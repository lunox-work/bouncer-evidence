"""R4 (hidden): formatting gives the shortest string that parses back."""
from decimal import Decimal
from fractions import Fraction

import pytest

from src.solution import format_duration, parse_duration

LARGEST = 9007199254740991


# happy 3: Formatting

def test_happy_3__spec_examples():
    assert format_duration(0) == "0ms"
    assert format_duration(250) == "250ms"
    assert format_duration(90000) == "1m30s"
    assert format_duration(5400000) == "1h30m"
    assert format_duration(86400000) == "1d"
    assert format_duration(90061001) == "1d1h1m1s1ms"


# extends test_happy_3__one_second / one_millisecond: each single unit
def test_happy_3__one_minute():
    assert format_duration(60000) == "1m"


def test_happy_3__one_hour():
    assert format_duration(3600000) == "1h"


def test_happy_3__largest_ms_only():
    assert format_duration(999) == "999ms"


# extends test_happy_3__minutes_and_seconds: just below each unit boundary
def test_happy_3__just_below_a_minute():
    assert format_duration(59999) == "59s999ms"


def test_happy_3__just_below_an_hour():
    assert format_duration(3599999) == "59m59s999ms"


def test_happy_3__just_below_a_day():
    assert format_duration(86399999) == "23h59m59s999ms"


# extends test_happy_3__hours_and_minutes: counts never exceed the next unit
def test_happy_3__ninety_seconds_is_not_90s():
    assert format_duration(90000) != "90s"
    assert format_duration(5400000) != "90m"


def test_happy_3__twenty_five_hours():
    assert format_duration(90000000) == "1d1h"


def test_happy_3__one_second_and_a_half():
    assert format_duration(1500) == "1s500ms"


# extends test_happy_3__one_day: more days
def test_happy_3__two_days():
    assert format_duration(172800000) == "2d"


def test_happy_3__seven_days():
    assert format_duration(604800000) == "7d"


def test_happy_3__a_year_of_days():
    assert format_duration(31536000000) == "365d"


# extends test_happy_3__inner_zero_components_left_out: other gap patterns
def test_happy_3__hour_and_millisecond():
    assert format_duration(3600001) == "1h1ms"


def test_happy_3__second_and_millisecond():
    assert format_duration(1001) == "1s1ms"


def test_happy_3__day_and_second():
    assert format_duration(86401000) == "1d1s"


def test_happy_3__day_hour_and_second():
    assert format_duration(90001000) == "1d1h1s"


def test_happy_3__day_and_minute():
    assert format_duration(86460000) == "1d1m"


# extends test_happy_3__every_unit: larger counts in every unit
def test_happy_3__multi_digit_every_unit():
    assert format_duration(12 * 86400000 + 23 * 3600000 + 59 * 60000 + 58 * 1000 + 999) == "12d23h59m58s999ms"


def test_happy_3__large_value_no_milliseconds():
    assert format_duration(10 ** 15) == "11574074d1h46m40s"


def test_happy_3__power_of_two():
    assert format_duration(4503599627370496) == "52124995d16h29m30s496ms"


def test_happy_3__result_is_str():
    assert type(format_duration(250)) is str


# boundary 3: Formatting the largest value

def test_boundary_3__spec_example():
    assert format_duration(LARGEST) == "104249991d8h59m991ms"


# extends test_boundary_3__one_below_largest_value: other values near the top
def test_boundary_3__one_second_below_largest():
    assert format_duration(LARGEST - 1000) == "104249991d8h58m59s991ms"


def test_boundary_3__one_minute_below_largest():
    assert format_duration(LARGEST - 60000) == "104249991d8h58m991ms"


def test_boundary_3__one_day_below_largest():
    assert format_duration(LARGEST - 86400000) == "104249990d8h59m991ms"


def test_boundary_3__largest_whole_days():
    assert format_duration(9007199222400000) == "104249991d"


# boundary 4: Formatting then parsing gives the number back

def test_boundary_4__spec_example():
    assert parse_duration(format_duration(123456789)) == 123456789


# extends test_boundary_4__round_trip: many other values
def test_boundary_4__round_trip_many_values():
    values = [1, 999, 1000, 1001, 59999, 60000, 60001, 3599999, 3600000,
              86399999, 86400000, 86400001, 90061001, 987654321,
              10 ** 12 + 7, 10 ** 15, 4503599627370496, LARGEST - 1,
              LARGEST - 1000, LARGEST - 86400000]
    for value in values:
        assert parse_duration(format_duration(value)) == value


def test_boundary_4__round_trip_stepped_range():
    value = 7
    while value <= LARGEST:
        assert parse_duration(format_duration(value)) == value
        value = value * 3 + 11


# extends test_boundary_4__round_trip_text: a parsed non-canonical string
# formats back to its canonical form
def test_boundary_4__parse_then_format_canonicalises():
    assert format_duration(parse_duration("90m")) == "1h30m"
    assert format_duration(parse_duration("1d0h0m0s0ms")) == "1d"
    assert format_duration(parse_duration("0s")) == "0ms"


def test_boundary_4__round_trip_other_text():
    assert format_duration(987654321) == "11d10h20m54s321ms"


# unhappy 4: Out-of-range values are rejected

def test_unhappy_4__spec_examples_all_rejected():
    for value in [-1, 9007199254740992, True, 1.0]:
        with pytest.raises(ValueError, match="milliseconds"):
            format_duration(value)


# extends test_unhappy_4__rejects_negative
def test_unhappy_4__rejects_large_negative():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(-86400000)


def test_unhappy_4__rejects_negative_largest():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(-LARGEST)


# extends test_unhappy_4__rejects_one_above_largest
def test_unhappy_4__rejects_far_above_largest():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(10 ** 30)


def test_unhappy_4__rejects_two_to_the_64():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(2 ** 64)


# extends test_unhappy_4__rejects_float: other floats
def test_unhappy_4__rejects_float_zero():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(0.0)


def test_unhappy_4__rejects_fractional_float():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(1.5)


def test_unhappy_4__rejects_large_whole_float():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(5400000.0)


def test_unhappy_4__rejects_nan():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(float("nan"))


def test_unhappy_4__rejects_infinity():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(float("inf"))


# extends test_unhappy_4__rejects_numeric_string / none: other non-ints
def test_unhappy_4__rejects_duration_string():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration("1h30m")


def test_unhappy_4__rejects_empty_string():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration("")


def test_unhappy_4__rejects_decimal():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(Decimal("250"))


def test_unhappy_4__rejects_fraction():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(Fraction(250, 1))


def test_unhappy_4__rejects_list():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration([250])


def test_unhappy_4__rejects_bytes():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(b"250")
