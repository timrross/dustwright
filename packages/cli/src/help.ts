/** CLI version, kept in step with package.json. */
export const VERSION = "0.0.0";

/** Top-level help text printed by `rsd --help`. */
export const HELP_TEXT = `dustwright ${VERSION} (alias: rsd)

Describe, check, view and export Minecraft redstone designs (.rsd.json, format rsd/1).

Usage: rsd <command> [options]

Commands:
  validate <file> [--json] [--strict]     Check a design (stages 1 to 3)
  export <file> --to <mcfunction|mcstructure> --pack <dir> [--clear] [--origin x y z]
                                           Write a design into a behavior pack
  export --list                            List the available exporters
  bundle <file> -o <html>                  Write a single-file viewer
  sheets <file> -o <dir>                   Write layer sheet SVGs
  pack <file> -o <mcpack>                  Zip a one-design behavior pack
  registry dump [-o <file>]                Print (or write) the Bedrock mapping table
  mcp                                      Serve the commands as MCP tools over stdio

Options:
  -h, --help       Show this help
  -v, --version    Show the version

Exit codes: 0 ok, 1 validation errors, 2 usage or I/O error.
`;
