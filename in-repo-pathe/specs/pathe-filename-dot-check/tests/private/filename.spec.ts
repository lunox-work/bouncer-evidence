import { expect, it } from "vitest";

import { filename } from "../../src/utils";

function check(files: Record<string, string | undefined>) {
  for (const [path, result] of Object.entries(files)) {
    if (result === undefined) {
      expect(filename(path), path).toBeUndefined();
    } else {
      expect(filename(path), path).toBe(result);
    }
  }
}

// --- Rule: The result comes from the last segment after splitting on both "/" and "\" ---

// Extends "[happy-1] directories are removed for POSIX and Windows paths"
it("[happy-1] deeper POSIX, Windows and UNC paths keep only the last segment's name", () => {
  check({
    "/usr/local/share/doc/myfile.html": "myfile",
    "../../src/components/myfile.html": "myfile",
    "C:\\Users\\me\\Documents\\report.html": "report",
    "\\\\server\\share\\doc.docx": "doc",
    "./a.b/c.d/myfile.html": "myfile",
    "C:\\a.b\\c.d\\myfile.html": "myfile",
  });
});

// Extends "[happy-1] directories are removed ..." with dotted directories and no extension
it("[happy-1] directories with dots are removed even when the file has no extension", () => {
  check({
    "./a.b/myfile": "myfile",
    "..\\x.y\\myfile": "myfile",
    "C:\\a.b\\file": "file",
  });
});

// Extends "[happy-1] a file directly under a root separator loses the separator"
it("[happy-1] repeated leading separators before the file are removed", () => {
  check({
    "//myfile.html": "myfile",
    "\\\\myfile.html": "myfile",
    "/\\/myfile.html": "myfile",
    "x.y//myfile": "myfile",
  });
});

// Extends "[happy-1] directories are removed ..." with a much longer path
it("[happy-1] a path with hundreds of dotted directories keeps only the last name", () => {
  const dirs = Array.from({ length: 300 }, (_, i) =>
    i % 2 ? `dir.${i}` : `d${i}.x`,
  );
  expect(filename(dirs.join("/") + "/myfile.html")).toBe("myfile");
  expect(filename(dirs.join("\\") + "\\myfile.html")).toBe("myfile");
  expect(filename(dirs.join("/") + "/myfile")).toBe("myfile");
});

// Extends "[happy-2] a plain name with an extension"
it("[happy-2] plain names with extensions of various lengths", () => {
  check({
    "index.ts": "index",
    "x.jpeg": "x",
    "photo.JPEG": "photo",
    "file.verylongextensionname": "file",
    "my file.txt": "my file",
    "résumé.pdf": "résumé",
    "\u{1F600}.png": "\u{1F600}",
  });
});

// Extends "[happy-2] a one-character name with a one-character extension"
it("[happy-2] a colon is not a separator and a very long name keeps all of it", () => {
  check({
    "C:file.txt": "C:file",
    "C:": "C:",
  });
  const long = "n".repeat(10000);
  expect(filename(long + ".txt")).toBe(long);
  expect(filename("x/y.z")).toBe("y");
});

// Extends "[boundary-1] mixed separators are all treated as separators"
it("[boundary-1] many alternating separators all split the path", () => {
  check({
    "a\\b/c\\d/e.f": "e",
    "/x\\y/z.txt": "z",
    "C:\\Users/me\\file.name.ext": "file.name",
    "dir\\sub/x.y\\file.md": "file",
  });
});

// Extends "[boundary-1] a backslash after the last slash still splits the segment"
it("[boundary-1] mixed separators with dotted directories and no extension", () => {
  check({
    "a.b\\c/README": "README",
    "a/b.c\\README": "README",
    "C:/x.y\\sub/README": "README",
    "x.y/z.w\\LICENSE": "LICENSE",
  });
});

// Extends "[boundary-2] a dot in a directory name does not affect the result"
it("[boundary-2] other dotted directories before extensionless names", () => {
  check({
    "x.y/test": "test",
    "my.dir/test": "test",
    "dir.v2/Dockerfile": "Dockerfile",
    "/a.b/c/myfile": "myfile",
    "../x.y/myfile": "myfile",
    "C:\\Program Files (x86)\\app.v1\\LICENSE": "LICENSE",
    ".config/nvim/init": "init",
  });
});

// Extends "[boundary-2] several dotted directories before an extensionless name"
it("[boundary-2] dotted directories before names with dots or dotfiles", () => {
  check({
    "/x.y/a.b.c": "a.b",
    "/home/.ssh/config": "config",
    "a.b/c.d/e": "e",
    "a.b.c.d/e.f": "e",
    "/x.y/.env": ".env",
  });
});

// Extends "[boundary-2] several dotted directories ..." with a longer path
it("[boundary-2] a hundred dotted directories before an extensionless name", () => {
  const prefix = Array.from({ length: 100 }, (_, i) => `v1.${i}.0`).join("/");
  expect(filename(prefix + "/README")).toBe("README");
  expect(filename(prefix.replaceAll("/", "\\") + "\\README")).toBe("README");
});

// --- Rule: An empty last segment gives undefined ---

// Extends "[boundary-3] a trailing separator or an empty path gives undefined"
it("[boundary-3] trailing separators after dotted segments give undefined", () => {
  check({
    "foo.txt/": undefined,
    "a.b/c.d/": undefined,
    "foo/bar\\baz.qux\\": undefined,
    "/temp/foo.d.ts/": undefined,
    "a.b.c/": undefined,
    "/a.b/": undefined,
  });
});

// Extends "[boundary-3] a lone backslash or repeated separators give undefined"
it("[boundary-3] special and dot segments followed by a separator give undefined", () => {
  check({
    "../": undefined,
    "./": undefined,
    "x/.../": undefined,
    ".gitignore/": undefined,
    ".\\": undefined,
    "..\\": undefined,
    "C:/": undefined,
  });
});

// Extends "[boundary-3] a lone backslash or repeated separators give undefined"
it("[boundary-3] many trailing separators give undefined", () => {
  expect(filename("/".repeat(200))).toBeUndefined();
  expect(filename("\\/".repeat(200))).toBeUndefined();
  expect(filename("a/b.c" + "/".repeat(50))).toBeUndefined();
  expect(filename("a/b.c" + "\\".repeat(50))).toBeUndefined();
});

// Extends "[boundary-3] a trailing separator or an empty path gives undefined"
it("[boundary-3] the empty-segment result is exactly undefined, not an empty string", () => {
  for (const path of ["", "foo/", "x.y\\", "a.b/c.d/"]) {
    const result = filename(path);
    expect(result).toBeUndefined();
    expect(result).not.toBe("");
  }
});

// Extends "[unhappy-1] the segment before a trailing separator is not used"
it("[unhappy-1] a dotted segment before a trailing slash is not used", () => {
  const result = filename("/temp/foo.txt/");
  expect(result).toBeUndefined();
  expect(result).not.toBe("foo");
  expect(result).not.toBe("foo.txt");
});

// Extends "[unhappy-1] a segment with an extension before a trailing backslash is not used"
it("[unhappy-1] segments before trailing separators in several forms are not used", () => {
  const cases: Array<[string, string]> = [
    ["C:\\temp\\foo\\", "foo"],
    ["/a.b/c.d/", "c"],
    ["foo/bar//", "bar"],
    ["x/.env/", ".env"],
    ["../x.y/..\\", "."],
    ["a/archive.tar.gz/", "archive.tar"],
  ];
  for (const [path, previous] of cases) {
    const result = filename(path);
    expect(result, path).toBeUndefined();
    expect(result, path).not.toBe(previous);
  }
});

// --- Rule: A name with no dot is returned unchanged ---

// Extends "[happy-3] files without an extension"
it("[happy-3] extensionless names under dotted directories are returned whole", () => {
  check({
    Dockerfile: "Dockerfile",
    "x.y/node": "node",
    "x.y\\Makefile": "Makefile",
    "/a.b/c/LICENSE": "LICENSE",
    "C:\\x.y\\z\\bin": "bin",
    "foo.d/README": "README",
  });
});

// Extends "[happy-3] a one-character name without an extension"
it("[happy-3] long and punctuated names without a dot are returned unchanged", () => {
  const long = "a".repeat(5000);
  expect(filename(long)).toBe(long);
  expect(filename("x.y/" + long)).toBe(long);
  expect(filename("dir.v1/my-file_v2 (copy)")).toBe("my-file_v2 (copy)");
  expect(filename("foo/ ")).toBe(" ");
});

// --- Rule: A leading dot is part of the name and is never an extension separator ---

// Extends "[happy-4] dotfiles with no further dot are returned whole"
it("[happy-4] other dotfiles under various directories are returned whole", () => {
  check({
    ".bash_profile": ".bash_profile",
    ".npmrc": ".npmrc",
    "/x.y/.env": ".env",
    "a.b\\.bashrc": ".bashrc",
    "./.gitignore": ".gitignore",
    "..\\.prettierrc": ".prettierrc",
    "~/.zshrc": ".zshrc",
    "C:\\x.y\\.env": ".env",
  });
});

// Extends "[happy-4] a dotfile whose name is a single character after the dot"
it("[happy-4] a dotfile with a long name is returned whole", () => {
  const name = "." + "z".repeat(3000);
  expect(filename(name)).toBe(name);
  expect(filename("a.b/c.d/" + name)).toBe(name);
});

// Extends "[boundary-4] a dotfile with another dot loses only its last extension"
it("[boundary-4] dotfiles with further dots under dotted directories", () => {
  check({
    ".a.b.c": ".a.b",
    "/.d/.e.f": ".e",
    "/x.y/.env.local": ".env",
    ".babelrc.json": ".babelrc",
    "C:\\x.y\\.prettierrc.yaml": ".prettierrc",
  });
});

// Extends "[boundary-4] a dotfile with three dots keeps all but the last extension"
it("[boundary-4] a name starting with two dots loses everything after its last dot", () => {
  check({
    "..hidden": ".",
    "dir/..hidden": ".",
    ".a..b": ".a.",
    "x.y\\.a.b.c.d": ".a.b.c",
  });
});

// --- Rule: Only the text after the last dot is removed ---

// Extends "[boundary-5] names with several dots"
it("[boundary-5] other names with several dots lose only the final extension", () => {
  check({
    "a.b.c.d.e": "a.b.c.d",
    "lib.min.js.map": "lib.min.js",
    "/x.y/a.b.c": "a.b",
    "jquery-3.7.1.min.js": "jquery-3.7.1.min",
    "v1.2.3": "v1.2",
    "a..b": "a.",
  });
});

// Extends "[boundary-5] a name with many dots loses only the final segment"
it("[boundary-5] a name with a thousand dots loses only the final segment", () => {
  const name = "x" + ".y".repeat(1000);
  expect(filename(name)).toBe("x" + ".y".repeat(999));
  expect(filename("a.b/c.d\\" + name)).toBe("x" + ".y".repeat(999));
});

// Extends "[boundary-6] a trailing dot is removed as an empty extension"
it("[boundary-6] a trailing dot is removed under dotted and Windows directories", () => {
  check({
    "a/b.": "b",
    "x.y/file.": "file",
    "C:\\tmp\\file.": "file",
    "a.b.": "a.b",
    ".a.": ".a",
  });
});

// Extends "[boundary-6] only the final one of two trailing dots is removed"
it("[boundary-6] only the final one of many trailing dots is removed", () => {
  check({
    "file...": "file..",
    ".gitignore..": ".gitignore.",
    "x.y/a.b...": "a.b..",
  });
});

// --- Rule: The special segments "." and ".." follow the same dot rules and both give "." ---

// Extends "[boundary-7] current and parent directory segments"
it("[boundary-7] dot segments after dotted directories and other separators", () => {
  check({
    "x.y/..": ".",
    "/..": ".",
    "\\..": ".",
    "..\\..": ".",
    "../..": ".",
    "x.y/.": ".",
    "C:/.": ".",
    "./.": ".",
    "/a/b/..": ".",
  });
});

// Extends "[boundary-7] three dots lose only the last one"
it("[boundary-7] runs of more than three dots lose only the last one", () => {
  check({
    "a.b/...": "..",
    ".....": "....",
    "x\\....": "...",
  });
  expect(filename(".".repeat(100))).toBe(".".repeat(99));
});
