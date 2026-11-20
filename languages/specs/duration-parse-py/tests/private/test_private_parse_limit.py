"""R3 (hidden): the result is an int no larger than 2^53 - 1."""
import pytest

from src.solution import parse_duration

LARGEST = 9007199254740991


# boundary 2: The largest duration parses

def test_boundary_2__spec_example():
    assert parse_duration("104249991d8h59m991ms") == LARGEST


# extends test_boundary_2__largest_duration_in_milliseconds: other unit mixes
def test_boundary_2__largest_in_seconds_and_ms():
    assert parse_duration("9007199254740s991ms") == LARGEST


def test_boundary_2__largest_in_minutes_and_ms():
    assert parse_duration("150119987579m991ms") == LARGEST


def test_boundary_2__largest_in_hours():
    assert parse_duration("2501999792h59m991ms") == LARGEST


def test_boundary_2__largest_with_surrounding_whitespace():
    assert parse_duration(" 104249991d8h59m991ms\n") == LARGEST


def test_boundary_2__largest_result_is_int():
    assert type(parse_duration("9007199254740991ms")) is int


def test_boundary_2__one_below_largest():
    assert parse_duration("104249991d8h59m990ms") == LARGEST - 1


def test_boundary_2__largest_whole_days():
    assert parse_duration("104249991d") == 9007199222400000


# unhappy 3: Totals above the largest are rejected

def test_unhappy_3__spec_examples_all_rejected():
    for text in ["104249991d8h59m992ms", "99999999999999999999ms"]:
        with pytest.raises(ValueError, match="duration"):
            parse_duration(text)


# extends test_unhappy_3__rejects_one_above_largest_in_mixed_units: overflow
# only from the sum, every component on its own within range
def test_unhappy_3__rejects_one_above_largest_in_seconds_and_ms():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("9007199254740s992ms")


def test_unhappy_3__rejects_one_above_largest_in_hours():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("2501999792h59m992ms")


def test_unhappy_3__rejects_one_above_largest_via_seconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("104249991d8h59m1s")


# extends test_unhappy_3__rejects_huge_millisecond_count: big counts in larger units
def test_unhappy_3__rejects_too_many_days():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("104249992d")


def test_unhappy_3__rejects_too_many_seconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("9007199254741s")


def test_unhappy_3__rejects_too_many_hours_after_days():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("104249991d9h")


def test_unhappy_3__rejects_largest_count_in_days():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("9007199254740991d")


def test_unhappy_3__rejects_huge_count_in_every_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("99999999999999999999d99999999999999999999h")


# extends test_unhappy_3__rejects_one_above_largest_in_milliseconds:
# values a float-based sum would round down to the largest
def test_unhappy_3__rejects_two_above_largest_in_milliseconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("9007199254740993ms")


def test_unhappy_3__rejects_far_above_largest_in_milliseconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("18014398509481984ms")
