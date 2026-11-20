import { expect, it, vi } from "vitest";

import { basename } from "../../src/path";

const WINDOWS_CWD = String.raw`C:\Windows\path\only`;

function withWindowsCwd<T>(function_: () => T): T {
  const cwd = process.cwd;
  process.cwd = vi.fn(() => WINDOWS_CWD);
  try {
    return function_();
  } finally {
    process.cwd = cwd;
  }
}

// ---------------------------------------------------------------------------
// @happy 1: Paths that end in a name keep their current result
// ---------------------------------------------------------------------------

// Extends "[happy-1] paths that end in a name keep their current result":
// other names, case, spaces, UNC, lowercase drive and multi-dot extensions.
it("[happy-1] other paths that end in a name keep the last segment as it is", () => {
  expect(basename("/a/b/c/d/e")).to.equal("e");
  expect(basename("Foo/BAR.Txt")).to.equal("BAR.Txt");
  expect(basename("foo bar/baz qux.txt")).to.equal("baz qux.txt");
  expect(basename("c:\\temp\\Readme.MD")).to.equal("Readme.MD");
  expect(basename("\\\\server\\share\\file.txt")).to.equal("file.txt");
  expect(basename("a///b")).to.equal("b");
  expect(basename("a\\\\\\b")).to.equal("b");
  expect(basename("/archive.tar.gz", ".gz")).to.equal("archive.tar");
  expect(basename("/archive.tar.gz", ".tar.gz")).to.equal("archive");
});

// Extends "[happy-1] an empty interior segment does not affect a path ending in a name, with process.cwd mocked to Windows"
it("[happy-1] runs of empty interior segments do not affect a path ending in a name, with process.cwd mocked to Windows", () => {
  withWindowsCwd(() => {
    expect(basename("a////b/c")).to.equal("c");
    expect(basename(".\\x\\\\y.html", ".html")).to.equal("y");
  });
});

// ---------------------------------------------------------------------------
// @happy 2: A single trailing slash is ignored
// ---------------------------------------------------------------------------

// Extends "[happy-2] a single trailing slash is ignored": other paths, a
// name with a dot, a deep path, and a relative path.
it("[happy-2] a single trailing slash is ignored for other paths", () => {
  expect(basename("a/b/c/")).to.equal("c");
  expect(basename("/x/")).to.equal("x");
  expect(basename("./foo/bar.txt/")).to.equal("bar.txt");
  expect(basename("/Users/Some Name/My Docs/")).to.equal("My Docs");
  expect(basename("node_modules/pathe/")).to.equal("pathe");
});

// Extends "[happy-2] a single trailing slash is ignored": a long path.
it("[happy-2] a single trailing slash is ignored on a path with many segments", () => {
  const segments = Array.from({ length: 500 }, (_, index) => `seg${index}`);
  expect(basename(`/${segments.join("/")}/`)).to.equal("seg499");
});

// Extends "[happy-2] a single trailing slash is ignored with process.cwd mocked to Windows"
it("[happy-2] a single trailing slash on a relative path is ignored with process.cwd mocked to Windows", () => {
  withWindowsCwd(() => {
    expect(basename("rel/dir/")).to.equal("dir");
  });
});

// ---------------------------------------------------------------------------
// @boundary 1: Several trailing slashes are all ignored
// ---------------------------------------------------------------------------

// Extends "[boundary-1] several trailing slashes are all ignored": a
// shortcut that strips only a bounded number of trailing slashes fails here.
it("[boundary-1] many trailing slashes are all ignored", () => {
  expect(basename(`a/b${"/".repeat(10)}`)).to.equal("b");
  expect(basename(`/temp/dir${"/".repeat(100)}`)).to.equal("dir");
  expect(basename(`dir${"/".repeat(1000)}`)).to.equal("dir");
});

// Extends "[boundary-1] several trailing slashes are all ignored": empty
// interior segments combined with several trailing ones.
it("[boundary-1] empty interior segments and several trailing slashes are all skipped", () => {
  expect(basename("//a//b//c////")).to.equal("c");
  expect(basename("x//y///")).to.equal("y");
});

// Extends "[boundary-1] a single-segment relative path with a trailing slash returns that segment"
it("[boundary-1] a single segment with a leading and several trailing slashes returns that segment", () => {
  expect(basename("/dir///")).to.equal("dir");
  expect(basename("///dir///")).to.equal("dir");
  expect(basename("x///")).to.equal("x");
});

it("[boundary-1] several trailing slashes are ignored with process.cwd mocked to Windows", () => {
  withWindowsCwd(() => {
    expect(basename("a/b////")).to.equal("b");
  });
});

// ---------------------------------------------------------------------------
// @boundary 2: The last non-empty segment is returned as it is
// ---------------------------------------------------------------------------

// Extends "[boundary-2] the last non-empty segment is returned as it is, not
// resolved or trimmed": several trailing separators and backslashes.
it("[boundary-2] dot segments before several trailing separators are returned as they are", () => {
  expect(basename("a/b/..///")).to.equal("..");
  expect(basename("a/b/.//")).to.equal(".");
  expect(basename("a\\..\\")).to.equal("..");
  expect(basename(".\\")).to.equal(".");
  expect(basename("C:\\temp\\..\\")).to.equal("..");
  expect(basename("/../")).to.equal("..");
  expect(basename("...//")).to.equal("...");
});

// A shortcut that normalizes (resolves `..`) first would return "a" or "".
it("[boundary-2] a trailing dot-dot is not resolved against the segment before it", () => {
  expect(basename("x/y/../")).to.equal("..");
  expect(basename("x/y/..")).to.equal("..");
  expect(basename("x/y/.")).to.equal(".");
});

// Extends "[boundary-2] a whitespace-only last segment is not trimmed or
// skipped": other whitespace, and whitespace around a name.
it("[boundary-2] other whitespace-only and padded last segments are not trimmed or skipped", () => {
  expect(basename("a/   /")).to.equal("   ");
  expect(basename("a/\t//")).to.equal("\t");
  expect(basename("a/ b /")).to.equal(" b ");
  expect(basename(" /")).to.equal(" ");
  expect(basename("a/ ")).to.equal(" ");
  expect(basename("a\\ \\")).to.equal(" ");
});

// ---------------------------------------------------------------------------
// @happy 3: Trailing backslashes are ignored like trailing slashes
// ---------------------------------------------------------------------------

// Extends "[happy-3] trailing backslashes are ignored like trailing slashes":
// lowercase drive, many backslashes, UNC with more depth.
it("[happy-3] trailing backslashes are ignored on other Windows paths", () => {
  expect(basename("c:\\temp\\dir\\")).to.equal("dir");
  expect(basename("D:\\a\\b\\c\\")).to.equal("c");
  expect(basename("C:\\temp\\dir" + "\\".repeat(50))).to.equal("dir");
  expect(basename("\\\\server\\share\\folder\\\\")).to.equal("folder");
  expect(basename("\\\\server\\")).to.equal("server");
  expect(basename("dir\\")).to.equal("dir");
  expect(basename("..\\dir\\\\\\")).to.equal("dir");
});

// Extends "[happy-3] mixed trailing slashes and backslashes are all ignored":
// longer and other orders of mixed separators.
it("[happy-3] longer runs of mixed trailing slashes and backslashes are all ignored", () => {
  expect(basename("a/b\\/\\/\\/\\/")).to.equal("b");
  expect(basename("a\\b\\\\//\\\\//")).to.equal("b");
  expect(basename("/x\\y/z/\\")).to.equal("z");
  expect(basename("C:/temp\\dir/\\")).to.equal("dir");
});

it("[happy-3] trailing backslashes are ignored with process.cwd mocked to Windows", () => {
  withWindowsCwd(() => {
    expect(basename("C:\\temp\\dir\\\\")).to.equal("dir");
    expect(basename("\\\\server\\share\\")).to.equal("share");
  });
});

// ---------------------------------------------------------------------------
// @boundary 3: A drive root returns the drive, not an empty string
// ---------------------------------------------------------------------------

// Extends "[boundary-3] a drive root returns the drive, not an empty string":
// other drive letters; a shortcut special-casing "C" fails here.
it("[boundary-3] other drive roots return the drive with its letter upper-cased", () => {
  expect(basename("D:\\")).to.equal("D:");
  expect(basename("z:\\")).to.equal("Z:");
  expect(basename("d:/")).to.equal("D:");
  expect(basename("A:/")).to.equal("A:");
});

// Extends "[boundary-3] a drive root returns the drive, not an empty string":
// several trailing separators after the drive.
it("[boundary-3] a drive followed by several separators returns the drive", () => {
  expect(basename("C:\\\\")).to.equal("C:");
  expect(basename("c:\\\\\\")).to.equal("C:");
  expect(basename("c:///")).to.equal("C:");
  expect(basename("e:/\\/")).to.equal("E:");
});

// Extends "[boundary-3] a bare lowercase drive with no separator keeps its
// case": other letters. A shortcut that upper-cases any drive-like result
// fails here.
it("[boundary-3] other bare lowercase drives with no separator keep their case", () => {
  expect(basename("d:")).to.equal("d:");
  expect(basename("z:")).to.equal("z:");
  expect(basename("D:")).to.equal("D:");
});

// The drive letter is upper-cased only by normalizeWindowsPath, which acts on
// a leading drive only.
it("[boundary-3] a drive-like segment that is not at the start keeps its case", () => {
  expect(basename("a/c:/")).to.equal("c:");
  expect(basename("/c:/")).to.equal("c:");
  expect(basename("x\\d:\\")).to.equal("d:");
});

it("[boundary-3] a drive root returns the drive with process.cwd mocked to Windows", () => {
  withWindowsCwd(() => {
    expect(basename("c:\\")).to.equal("C:");
    expect(basename("c:")).to.equal("c:");
  });
});

// ---------------------------------------------------------------------------
// @boundary 4: Empty and root-only paths return ""
// ---------------------------------------------------------------------------

// Extends "[boundary-4] empty and root-only paths return """: other lengths
// and mixed separators.
it('[boundary-4] root-only paths of other lengths and mixed separators return ""', () => {
  expect(basename("//")).to.equal("");
  expect(basename("\\\\")).to.equal("");
  expect(basename("/\\/\\")).to.equal("");
  expect(basename("\\/")).to.equal("");
  expect(basename("/".repeat(1000))).to.equal("");
  expect(basename("\\".repeat(1000))).to.equal("");
});

// Extends "[boundary-4] the empty string returns """: with process.cwd mocked.
it('[boundary-4] empty and root-only paths return "" with process.cwd mocked to Windows', () => {
  withWindowsCwd(() => {
    expect(basename("")).to.equal("");
    expect(basename("/")).to.equal("");
    expect(basename("\\")).to.equal("");
  });
});

// ---------------------------------------------------------------------------
// @boundary 5: An extension has no effect when there is no non-empty segment
// ---------------------------------------------------------------------------

// Extends "[boundary-5] an extension has no effect when there is no non-empty
// segment": other extensions, including ones made of separators.
it('[boundary-5] other extensions on empty and root-only paths return ""', () => {
  expect(basename("", ".html")).to.equal("");
  expect(basename("\\", ".js")).to.equal("");
  expect(basename("/\\/", ".txt")).to.equal("");
  expect(basename("/", "/")).to.equal("");
  expect(basename("//", "/")).to.equal("");
  expect(basename("\\\\", "\\")).to.equal("");
  expect(basename("/".repeat(100), "x")).to.equal("");
});

// Extends "[boundary-5] a backslash-only path with an extension returns an empty string"
it('[boundary-5] a long backslash-only path with an extension returns "" with process.cwd mocked to Windows', () => {
  withWindowsCwd(() => {
    expect(basename("\\".repeat(20), ".html")).to.equal("");
  });
});

// ---------------------------------------------------------------------------
// @happy 4: The extension is removed even when the path ends in a separator
// ---------------------------------------------------------------------------

// Extends "[happy-4] the extension is removed even when the path ends in a
// separator": other extensions, many trailing separators, lowercase drive.
it("[happy-4] other extensions are removed when the path ends in separators", () => {
  expect(basename("src/index.ts/", ".ts")).to.equal("index");
  expect(basename(`a/b.js${"/".repeat(30)}`, ".js")).to.equal("b");
  expect(basename("c:\\temp\\page.htm\\", ".htm")).to.equal("page");
  expect(basename("a/b.md\\/\\/", ".md")).to.equal("b");
  expect(basename("/archive.tar.gz/", ".gz")).to.equal("archive.tar");
  expect(basename("/archive.tar.gz//", ".tar.gz")).to.equal("archive");
});

// Extends "[happy-4] the extension is removed after several trailing backslashes"
it("[happy-4] the extension is removed after many trailing backslashes with process.cwd mocked to Windows", () => {
  withWindowsCwd(() => {
    expect(basename(".\\myfile.html" + "\\".repeat(10), ".html")).to.equal(
      "myfile",
    );
  });
});

// The suffix is stripped from a dot segment too: ".." ends with ".".
it("[happy-4] a suffix is stripped from a dot-dot last segment before a trailing separator", () => {
  expect(basename("a/../", ".")).to.equal(".");
});

// ---------------------------------------------------------------------------
// @boundary 6: An extension equal to the whole segment is stripped to ""
// ---------------------------------------------------------------------------

// Extends "[boundary-6] an extension equal to the whole segment is stripped
// to """: several trailing separators, backslashes, other names.
it('[boundary-6] an extension equal to the whole segment before several separators gives ""', () => {
  expect(basename("a/.js///", ".js")).to.equal("");
  expect(basename("a\\.html\\\\", ".html")).to.equal("");
  expect(basename("x/README/", "README")).to.equal("");
  expect(basename("./", ".")).to.equal("");
  expect(basename("../", "..")).to.equal("");
});

// Extends "[boundary-6] an extension equal to a whole named segment before a
// trailing slash gives """: the drive segment, compared after normalization.
it('[boundary-6] an extension equal to an upper-cased drive root gives ""', () => {
  expect(basename("C:\\", "C:")).to.equal("");
  expect(basename("c:\\", "C:")).to.equal("");
});

// ---------------------------------------------------------------------------
// @unhappy 1: An extension that does not end the segment leaves it unchanged
// ---------------------------------------------------------------------------

// Extends "[unhappy-1] an extension that does not end the segment leaves it
// unchanged": extensions that match an earlier segment, are longer than the
// segment, or appear only in the middle.
it("[unhappy-1] an extension matching only an earlier segment leaves the last one unchanged", () => {
  expect(basename("a.js/b/", ".js")).to.equal("b");
  expect(basename("a/b.js/c//", ".js")).to.equal("c");
  expect(basename("a/b/", ".b")).to.equal("b");
  expect(basename("a/b.js.map/", ".js")).to.equal("b.js.map");
  expect(basename("a\\b.js\\", ".ts")).to.equal("b.js");
});

// An extension that contains a separator never ends a segment. A shortcut
// that strips the extension from the path before dropping trailing
// separators fails here.
it("[unhappy-1] an extension containing a separator leaves the last segment unchanged", () => {
  expect(basename("a/b/", "b/")).to.equal("b");
  expect(basename("a/b.js/", "js/")).to.equal("b.js");
  expect(basename("a/b.js/", ".js/")).to.equal("b.js");
  expect(basename("a\\b\\", "\\")).to.equal("b");
  expect(basename("a\\b.js\\", ".js\\")).to.equal("b.js");
  expect(basename("a/b", "a/b")).to.equal("b");
});

// Extends "[unhappy-1] the extension match is case-sensitive"
it("[unhappy-1] the extension match is case-sensitive in both directions", () => {
  expect(basename("a/b.js/", ".JS")).to.equal("b.js");
  expect(basename("a/B.Html//", ".html")).to.equal("B.Html");
  expect(basename("C:\\temp\\file.TXT\\", ".txt")).to.equal("file.TXT");
});

// The drive is upper-cased before the case-sensitive comparison.
it("[unhappy-1] a lowercase extension does not match an upper-cased drive root", () => {
  expect(basename("c:\\", "c:")).to.equal("C:");
});

// ---------------------------------------------------------------------------
// @boundary 7: An empty or undefined extension strips nothing
// ---------------------------------------------------------------------------

// Extends "[boundary-7] an empty or undefined extension strips nothing":
// other paths, several trailing separators and backslashes.
it("[boundary-7] an empty or undefined extension strips nothing from other paths", () => {
  expect(basename("a/b.js///", "")).to.equal("b.js");
  expect(basename("C:\\temp\\x.html\\", "")).to.equal("x.html");
  expect(basename("C:\\temp\\x.html\\\\", undefined)).to.equal("x.html");
  expect(basename("c:\\", "")).to.equal("C:");
  expect(basename("a/../", "")).to.equal("..");
});

// Extends "[boundary-7] an omitted extension strips nothing"
it("[boundary-7] an omitted extension strips nothing after mixed trailing separators", () => {
  expect(basename("a/b.js\\/")).to.equal("b.js");
  expect(basename("x/.js/")).to.equal(".js");
});

// ---------------------------------------------------------------------------
// @boundary 8: An extension without a leading dot is matched as a plain suffix
// ---------------------------------------------------------------------------

// Extends "[boundary-8] an extension without a leading dot is matched as a
// plain suffix": partial suffixes, which an extname-based shortcut misses.
it("[boundary-8] other dotless suffixes are stripped literally", () => {
  expect(basename("a/myfile.html/", "ml")).to.equal("myfile.ht");
  expect(basename("a/myfile.html/", "l")).to.equal("myfile.htm");
  expect(basename("a/myfile.html/", "e.html")).to.equal("myfil");
  expect(basename("a/bjs//", "js")).to.equal("b");
  expect(basename("a\\myfile.html\\", "html")).to.equal("myfile.");
  expect(basename("a/myfile.html", "html")).to.equal("myfile.");
});

// Extends "[boundary-8] a dotless extension is matched as a plain suffix with process.cwd mocked to Windows"
it("[boundary-8] a dotless suffix after several backslashes is stripped with process.cwd mocked to Windows", () => {
  withWindowsCwd(() => {
    expect(basename("C:\\a\\report_final\\\\", "_final")).to.equal("report");
  });
});
