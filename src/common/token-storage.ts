  try {
    const encrypted = fs.readFileSync(tokenPath, "utf8").trim();
    return decryptToken(encrypted);
  } catch (error) {
    // ENOENT = race between existsSync and readFileSync — treat as missing
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      process.stderr.write(
        `Warning: failed to decrypt stored token: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
    return null;
  }