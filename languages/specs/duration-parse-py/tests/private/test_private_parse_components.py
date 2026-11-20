"""R1 (hidden): a duration is one or more components, each a count and a unit."""
import pytest

from src.solution import parse_duration


# happy 1: Components add up

# extends test_happy_1__milliseconds: other counts in ms, including multi-digit
def test_happy_1__single_digit_milliseconds():
    assert parse_duration("5ms") == 5


def test_happy_1__one_millisecond():
    assert parse_duration("1ms") == 1


# extends test_happy_1__seconds
def test_happy_1__one_second():
    assert parse_duration("1s") == 1000


# extends test_happy_1__hours_and_minutes: a single minute vs millisecond
def test_happy_1__one_minute():
    assert parse_duration("1m") == 60000


def test_happy_1__one_hour():
    assert parse_duration("1h") == 3600000


# extends test_happy_1__days: larger day counts
def test_happy_1__many_days():
    assert parse_duration("365d") == 31536000000


def test_happy_1__million_days():
    assert parse_duration("1000000d") == 86400000000000


# extends test_happy_1__minutes_then_milliseconds_are_told_apart
def test_happy_1__minutes_then_seconds_not_read_as_ms():
    assert parse_duration("1m1s") == 61000


def test_happy_1__hours_then_milliseconds():
    assert parse_duration("1h5ms") == 3600005


def test_happy_1__seconds_then_milliseconds():
    assert parse_duration("2s250ms") == 2250


# extends test_happy_1__every_unit_once: skipping units in between
def test_happy_1__days_then_milliseconds():
    assert parse_duration("1d1ms") == 86400001


def test_happy_1__days_then_seconds():
    assert parse_duration("3d7s") == 259207000


def test_happy_1__hours_then_seconds():
    assert parse_duration("2h15s") == 7215000


def test_happy_1__multi_digit_every_unit():
    assert parse_duration("12d23h59m58s999ms") == 12 * 86400000 + 23 * 3600000 + 59 * 60000 + 58 * 1000 + 999


# extends test_happy_1__zero_components_add_nothing: zeros in other positions
def test_happy_1__leading_zero_component():
    assert parse_duration("0d1ms") == 1


def test_happy_1__all_zero_components():
    assert parse_duration("0d0h0m0s0ms") == 0


def test_happy_1__zero_days():
    assert parse_duration("0d") == 0


# counts containing zeros that are not leading are fine
def test_happy_1__counts_with_inner_and_trailing_zeros():
    assert parse_duration("10h100m1000s") == 36000000 + 6000000 + 1000000


def test_happy_1__count_ending_in_zero_ms():
    assert parse_duration("100ms") == 100


# extends test_happy_1__result_is_int
def test_happy_1__zero_result_is_int_not_bool():
    result = parse_duration("0s")
    assert type(result) is int
    assert result == 0


def test_happy_1__millisecond_result_is_int():
    assert type(parse_duration("250ms")) is int


# boundary 1: Surrounding whitespace is ignored

def test_boundary_1__spec_example_45m():
    assert parse_duration("  45m\n") == 2700000


# extends test_boundary_1__tabs_and_carriage_returns_stripped: Unicode
# whitespace that str.strip() removes
def test_boundary_1__unicode_whitespace_stripped():
    assert parse_duration("　 1s  ") == 1000


def test_boundary_1__separator_controls_stripped():
    assert parse_duration("\x1c\x1d1m\x1e\x1f\x85") == 60000


# extends test_boundary_1__multi_component_with_surrounding_whitespace
def test_boundary_1__long_surrounding_whitespace():
    assert parse_duration(" " * 5000 + "1d1h1m1s1ms" + "\n" * 5000) == 90061001


def test_boundary_1__only_leading_whitespace():
    assert parse_duration("\t\t250ms") == 250


def test_boundary_1__only_trailing_whitespace():
    assert parse_duration("250ms\r\n") == 250


# unhappy 1: Malformed durations are rejected

def test_unhappy_1__spec_examples_all_rejected():
    for text in ["", "90", "1.5h", "05s", "-3s", "+3s", "1_0s", "1h 30m",
                 "1h,30m", "3w", "3S", "3 s", "ms", "３s"]:
        with pytest.raises(ValueError, match="duration"):
            parse_duration(text)


# extends test_unhappy_1__rejects_whitespace_only
def test_unhappy_1__rejects_newline_only():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("\n\t ")


# extends test_unhappy_1__rejects_bare_number
def test_unhappy_1__rejects_large_bare_number():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("5400000")


def test_unhappy_1__rejects_bare_number_with_whitespace():
    with pytest.raises(ValueError, match="duration"):
        parse_duration(" 250 ")


# extends test_unhappy_1__rejects_decimal_point: in a later component
def test_unhappy_1__rejects_decimal_in_later_component():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h1.5m")


def test_unhappy_1__rejects_trailing_decimal_point():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1.s")


def test_unhappy_1__rejects_exponent():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1e3ms")


# extends test_unhappy_1__rejects_leading_zero: in a later component
def test_unhappy_1__rejects_leading_zero_in_later_component():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h05m")


def test_unhappy_1__rejects_many_leading_zeros_ms():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("007ms")


def test_unhappy_1__rejects_leading_zero_days():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("01d")


# extends test_unhappy_1__rejects_minus_sign / plus sign: between components
def test_unhappy_1__rejects_minus_in_later_component():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h-30m")


def test_unhappy_1__rejects_plus_in_later_component():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h+30m")


# extends test_unhappy_1__rejects_underscore
def test_unhappy_1__rejects_underscore_in_later_component():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h1_000ms")


def test_unhappy_1__rejects_underscore_separator():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h_30m")


# extends test_unhappy_1__rejects_space_between_components: other inner whitespace
def test_unhappy_1__rejects_tab_between_components():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h\t30m")


def test_unhappy_1__rejects_newline_between_components():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h\n30m")


def test_unhappy_1__rejects_unicode_space_between_components():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h 30m")


def test_unhappy_1__rejects_space_inside_count():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1 0s")


def test_unhappy_1__rejects_space_inside_ms_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("5m s")


# extends test_unhappy_1__rejects_comma_between_components: other separators
def test_unhappy_1__rejects_colon_separator():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h:30m")


def test_unhappy_1__rejects_semicolon_separator():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h;30m")


def test_unhappy_1__rejects_and_separator():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1hand30m")


# extends test_unhappy_1__rejects_unknown_unit
def test_unhappy_1__rejects_years():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1y")


def test_unhappy_1__rejects_microseconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("5us")


def test_unhappy_1__rejects_nanoseconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("5ns")


def test_unhappy_1__rejects_spelled_out_units():
    for text in ["5sec", "5min", "5hr", "5day", "5mss", "5sm"]:
        with pytest.raises(ValueError, match="duration"):
            parse_duration(text)


def test_unhappy_1__rejects_weeks_after_valid_component():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1d2w")


# extends test_unhappy_1__rejects_uppercase_unit: every other unit uppercase
def test_unhappy_1__rejects_uppercase_d_h_m():
    for text in ["1D", "1H", "1M", "3mS"]:
        with pytest.raises(ValueError, match="duration"):
            parse_duration(text)


def test_unhappy_1__rejects_uppercase_in_later_component():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h30M")


# extends test_unhappy_1__rejects_unit_without_count
def test_unhappy_1__rejects_lone_unit_letters():
    for text in ["d", "h", "m", "s"]:
        with pytest.raises(ValueError, match="duration"):
            parse_duration(text)


def test_unhappy_1__rejects_unit_without_count_after_component():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1hm")


def test_unhappy_1__rejects_unit_without_count_before_component():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("h30m")


# extends test_unhappy_1__rejects_fullwidth_digit: other non-ASCII digits
def test_unhappy_1__rejects_arabic_indic_digit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("٣s")


def test_unhappy_1__rejects_devanagari_digit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("३m")


def test_unhappy_1__rejects_superscript_digit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("²s")


def test_unhappy_1__rejects_non_ascii_digit_mixed_with_ascii():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1٣s")


def test_unhappy_1__rejects_non_ascii_digit_in_later_component():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h３m")


# extends test_unhappy_1__rejects_double_zero_count / bare zero
def test_unhappy_1__rejects_double_zero_ms():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("00ms")


# extends test_unhappy_1__rejects_trailing_count_without_unit
def test_unhappy_1__rejects_trailing_zero_without_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h0")


def test_unhappy_1__rejects_trailing_count_after_ms():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1s5")


# extends test_unhappy_1__rejects_trailing_garbage
def test_unhappy_1__rejects_leading_garbage():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("x1s")


def test_unhappy_1__rejects_garbage_between_components():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1hx30m")


def test_unhappy_1__rejects_trailing_dot():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1s.")


# a count too long for int() must still fail with the spec's message
def test_unhappy_1__rejects_count_beyond_int_digit_limit_with_duration_message():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1" + "0" * 5000 + "ms")
