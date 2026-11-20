"""R1: a duration is one or more components, each a count and a unit."""
import pytest

from src.solution import parse_duration


# happy 1: Components add up

def test_happy_1__milliseconds():
    assert parse_duration("250ms") == 250


def test_happy_1__seconds():
    assert parse_duration("90s") == 90000


def test_happy_1__hours_and_minutes():
    assert parse_duration("1h30m") == 5400000


def test_happy_1__days():
    assert parse_duration("2d") == 172800000


def test_happy_1__zero_seconds():
    assert parse_duration("0s") == 0


def test_happy_1__zero_components_add_nothing():
    assert parse_duration("1d0h0m0s0ms") == 86400000


def test_happy_1__result_is_int():
    assert type(parse_duration("1h30m")) is int


def test_happy_1__every_unit_once():
    assert parse_duration("1d1h1m1s1ms") == 90061001


def test_happy_1__minutes_then_milliseconds_are_told_apart():
    assert parse_duration("1m1ms") == 60001


def test_happy_1__zero_milliseconds():
    assert parse_duration("0ms") == 0


# boundary 1: Surrounding whitespace is ignored

def test_boundary_1__spaces_and_newline_stripped():
    assert parse_duration("  45m\n") == 2700000


def test_boundary_1__tabs_and_carriage_returns_stripped():
    assert parse_duration("\t\r\n 1s \x0b\x0c") == 1000


def test_boundary_1__multi_component_with_surrounding_whitespace():
    assert parse_duration(" 1h30m ") == 5400000


# unhappy 1: Malformed durations are rejected

def test_unhappy_1__rejects_empty_string():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("")


def test_unhappy_1__rejects_bare_number():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("90")


def test_unhappy_1__rejects_decimal_point():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1.5h")


def test_unhappy_1__rejects_leading_zero():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("05s")


def test_unhappy_1__rejects_minus_sign():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("-3s")


def test_unhappy_1__rejects_plus_sign():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("+3s")


def test_unhappy_1__rejects_underscore():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1_0s")


def test_unhappy_1__rejects_space_between_components():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h 30m")


def test_unhappy_1__rejects_comma_between_components():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h,30m")


def test_unhappy_1__rejects_unknown_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3w")


def test_unhappy_1__rejects_uppercase_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3S")


def test_unhappy_1__rejects_space_between_count_and_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3 s")


def test_unhappy_1__rejects_unit_without_count():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("ms")


def test_unhappy_1__rejects_fullwidth_digit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("３s")


def test_unhappy_1__rejects_whitespace_only():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("   ")


def test_unhappy_1__rejects_bare_zero():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("0")


def test_unhappy_1__rejects_double_zero_count():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("00s")


def test_unhappy_1__rejects_trailing_count_without_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h30")


def test_unhappy_1__rejects_uppercase_ms():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3MS")


def test_unhappy_1__rejects_mixed_case_ms():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3Ms")


def test_unhappy_1__rejects_trailing_garbage():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1sx")
