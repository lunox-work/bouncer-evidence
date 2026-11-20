import { expect, it } from "vitest";

import { normalizeAliases, filename, resolveAlias } from "../src/utils";

// --- Rule: The result comes from the last segment after splitting on both "/" and "\" ---

it("[happy-1] directories are removed for POSIX and Windows paths", () => {
  const files: Record<string, string> = {
    "/temp/myfile.html": "myfile",
    "./myfile.html": "myfile",
    "C:\\temp\\myfile.html": "myfile",
    "\\temp\\myfile.html": "myfile",
    ".\\myfile.html": "myfile",
  };
  for (const [path, result] of Object.entries(files)) {
    expect(filename(path)).toBe(result);
  }
});

it("[happy-1] a file directly under a root separator loses the separator", () => {
  expect(filename("/myfile.html")).toBe("myfile");
  expect(filename("\\myfile.html")).toBe("myfile");
});

it("[happy-2] a plain name with an extension", () => {
  expect(filename("test.html")).toBe("test");
});

it("[happy-2] a one-character name with a one-character extension", () => {
  expect(filename("a.b")).toBe("a");
});

it("[boundary-1] mixed separators are all treated as separators", () => {
  expect(filename("C:/temp\\sub/report.pdf")).toBe("report");
});

it("[boundary-1] a backslash after the last slash still splits the segment", () => {
  expect(filename("dir/sub\\report.pdf")).toBe("report");
  expect(filename("dir\\sub/report.pdf")).toBe("report");
});

it("[boundary-2] a dot in a directory name does not affect the result", () => {
  const files: Record<string, string> = {
    "/a.b/README": "README",
    "C:\\my.dir\\README": "README",
    "/home/.config/app.json": "app",
  };
  for (const [path, result] of Object.entries(files)) {
    expect(filename(path)).toBe(result);
  }
});

it("[boundary-2] several dotted directories before an extensionless name", () => {
  expect(filename("a.b.c/d.e\\.f.g/README")).toBe("README");
});

// --- Rule: An empty last segment gives undefined ---

it("[boundary-3] a trailing separator or an empty path gives undefined", () => {
  for (const path of ["", "foo/", "/", "C:\\temp\\", "foo\\bar/"]) {
    expect(filename(path)).toBeUndefined();
  }
});

it("[boundary-3] a lone backslash or repeated separators give undefined", () => {
  expect(filename("\\")).toBeUndefined();
  expect(filename("//")).toBeUndefined();
  expect(filename("foo/\\")).toBeUndefined();
});

it("[unhappy-1] the segment before a trailing separator is not used", () => {
  const result = filename("/temp/foo/");
  expect(result).toBeUndefined();
  expect(result).not.toBe("foo");
});

it("[unhappy-1] a segment with an extension before a trailing backslash is not used", () => {
  const result = filename("/temp/foo.txt\\");
  expect(result).toBeUndefined();
  expect(result).not.toBe("foo");
});

// --- Rule: A name with no dot is returned unchanged ---

it("[happy-3] files without an extension", () => {
  const files: Record<string, string> = {
    README: "README",
    "/usr/bin/node": "node",
    "C:\\bin\\Makefile": "Makefile",
  };
  for (const [path, result] of Object.entries(files)) {
    expect(filename(path)).toBe(result);
  }
});

it("[happy-3] a one-character name without an extension", () => {
  expect(filename("x")).toBe("x");
  expect(filename("/a/b")).toBe("b");
});

// --- Rule: A leading dot is part of the name and is never an extension separator ---

it("[happy-4] dotfiles with no further dot are returned whole", () => {
  const files: Record<string, string> = {
    ".gitignore": ".gitignore",
    "/home/user/.bashrc": ".bashrc",
    "C:\\repo\\.env": ".env",
  };
  for (const [path, result] of Object.entries(files)) {
    expect(filename(path)).toBe(result);
  }
});

it("[happy-4] a dotfile whose name is a single character after the dot", () => {
  expect(filename(".a")).toBe(".a");
  expect(filename("dir/.a")).toBe(".a");
});

it("[boundary-4] a dotfile with another dot loses only its last extension", () => {
  const files: Record<string, string> = {
    ".config.json": ".config",
    "/proj/.eslintrc.cjs": ".eslintrc",
    ".env.local": ".env",
  };
  for (const [path, result] of Object.entries(files)) {
    expect(filename(path)).toBe(result);
  }
});

it("[boundary-4] a dotfile with three dots keeps all but the last extension", () => {
  expect(filename(".env.production.local")).toBe(".env.production");
  expect(filename("C:\\proj\\.a.b")).toBe(".a");
});

// --- Rule: Only the text after the last dot is removed ---

it("[boundary-5] names with several dots", () => {
  const files: Record<string, string> = {
    "archive.tar.gz": "archive.tar",
    "/dist/index.min.js": "index.min",
    "types.d.ts": "types.d",
  };
  for (const [path, result] of Object.entries(files)) {
    expect(filename(path)).toBe(result);
  }
});

it("[boundary-5] a name with many dots loses only the final segment", () => {
  expect(filename("a.b.c.d")).toBe("a.b.c");
  expect(filename("C:\\x\\a.b.c.d")).toBe("a.b.c");
});

it("[boundary-6] a trailing dot is removed as an empty extension", () => {
  expect(filename("file.")).toBe("file");
  expect(filename("/tmp/file.")).toBe("file");
});

it("[boundary-6] only the final one of two trailing dots is removed", () => {
  expect(filename("file..")).toBe("file.");
  expect(filename(".gitignore.")).toBe(".gitignore");
});

// --- Rule: The special segments "." and ".." follow the same dot rules and both give "." ---

it("[boundary-7] current and parent directory segments", () => {
  const files: Record<string, string> = {
    ".": ".",
    "..": ".",
    "foo/.": ".",
    "foo/..": ".",
    "C:\\..": ".",
  };
  for (const [path, result] of Object.entries(files)) {
    expect(filename(path)).toBe(result);
  }
});

it("[boundary-7] three dots lose only the last one", () => {
  expect(filename("...")).toBe("..");
  expect(filename("\\.")).toBe(".");
});

// --- Rule: The other exports of src/utils keep their behaviour ---

it("[happy-5] resolveAlias is unchanged", () => {
  const aliases = {
    "~": "/root",
    "~assets": "/root/some/dir",
  };
  expect(resolveAlias("~assets/smth.jpg", aliases)).toBe(
    "/root/some/dir/smth.jpg",
  );
});

it("[happy-5] resolveAlias leaves a path whose alias prefix is not followed by a separator", () => {
  const aliases = {
    "~": "/root",
    "~assets": "/root/some/dir",
  };
  expect(resolveAlias("foo/bar.js", aliases)).toBe("foo/bar.js");
  expect(resolveAlias("./bar.js", aliases)).toBe("./bar.js");
});

it("[happy-6] normalizeAliases is unchanged", () => {
  expect(
    normalizeAliases({ "@": "/root", bingpot: "@/bingpot/index.ts" }),
  ).toEqual({ "@": "/root", bingpot: "/root/bingpot/index.ts" });
});

it("[happy-6] normalizeAliases does not resolve a value whose alias prefix is not followed by a separator", () => {
  expect(
    normalizeAliases({ "@": "/root", test: "@bingpot/index.ts" }),
  ).toEqual({ "@": "/root", test: "@bingpot/index.ts" });
});
