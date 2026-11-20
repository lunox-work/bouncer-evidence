

def change_base(x: int, base: int):
    """Change numerical base of input number x to base.
    return string representation after the conversion.
    base numbers are less than 10.
    >>> change_base(8, 3)
    '22'
    >>> change_base(8, 2)
    '1000'
    >>> change_base(7, 2)
    '111'
    """
    if base < 2 or base > 36:
        raise ValueError("Base must be between 2 and 36")
    digits = []
    while x:
        digits.append(str(x % base))
        x //= base
    if digits[-1] == '0':
        digits = digits[:-1]
    return ''.join(reversed(digits))
