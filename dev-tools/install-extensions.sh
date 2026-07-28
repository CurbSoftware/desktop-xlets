#!/bin/bash
# install-extensions.sh - Install Cinnamon desklets/applets to user directories.
#
# Auto-discovers extensions in this repository and installs them into the
# user-specific Cinnamon directories, named after each extension's UUID:
#     ~/.local/share/cinnamon/desklets/<uuid>/
#     ~/.local/share/cinnamon/applets/<uuid>/
#
# Default mode is "copy" (a true install that replaces any prior copy).
# Use --mode symlink for development (edits reflect immediately).
#
# See --help for full options.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DESKLET_DIR="$HOME/.local/share/cinnamon/desklets"
APPLET_DIR="$HOME/.local/share/cinnamon/applets"

# Defaults
TYPE="all"            # desklets | applets | all
NAME_GLOB=""          # restrict by UUID/source-dir glob
MODE="copy"           # copy | symlink
BACKUP=false
DRY_RUN=false
ASSUME_YES=false
RELOAD=false
ACTION="install"     # install | uninstall

# --- Colors (only when stdout is a tty) -----------------------------------
if [ -t 1 ]; then
    C_RESET=$'\033[0m';  C_GREEN=$'\033[1;32m';  C_YELLOW=$'\033[1;33m'
    C_RED=$'\033[1;31m'; C_CYAN=$'\033[1;36m';   C_BOLD=$'\033[1m'
else
    C_RESET=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_CYAN=""; C_BOLD=""
fi

log()  { echo "${C_BOLD}>>${C_RESET} $*"; }
ok()   { echo "  ${C_GREEN}OK${C_RESET}    $*"; }
skip() { echo "  ${C_YELLOW}SKIP${C_RESET}  $*"; }
warn() { echo "  ${C_YELLOW}!!${C_RESET}   $*"; }
err()  { echo "  ${C_RED}ERR${C_RESET}   $*" >&2; }
act()  { echo "  ${C_CYAN}$1${C_RESET}${2:+ $2}"; }

usage() {
    cat << 'EOF'
install-extensions.sh - Install Cinnamon extensions to user directories

USAGE:
    ./install-extensions.sh [OPTIONS]

DESCRIPTION:
    Auto-discovers desklets and applets in this repository and installs them
    into the user-specific Cinnamon directories:
        ~/.local/share/cinnamon/desklets/<uuid>/
        ~/.local/share/cinnamon/applets/<uuid>/
    Each install directory is named after the extension's UUID (read from
    metadata.json), so previously installed copies are replaced in place.

OPTIONS:
    -t, --type {desklets|applets|all}
            Filter by extension type (default: all).
    -n, --name <glob>
            Restrict to extensions whose UUID OR source directory name matches
            the given glob (e.g. --name '*clock*'). Quote the glob.
    -m, --mode {copy|symlink}
            copy    : rsync files into place (default; a true install).
            symlink : create a symlink to the repo dir (dev mode; edits
                      reflect immediately without reinstalling).
    -b, --backup
            Before replacing an existing install directory, move it to
            <uuid>.bak.<timestamp>. Ignored for symlinks.
        --dry-run
            Print the actions that would be taken without performing them.
    -y, --yes
            Skip the interactive confirmation prompt (required when stdin is
            not a terminal).
    -r, --reload
            Run "cinnamon --replace &" after a successful install.
        --uninstall
            Remove the matched extensions from the user directories instead of
            installing. Backups created with --backup are left untouched.
    -h, --help
            Show this help.

EXAMPLES:
    ./install-extensions.sh                       # install everything (copy)
    ./install-extensions.sh --type desklets       # desklets only
    ./install-extensions.sh -n '*clock*'          # only the world clock
    ./install-extensions.sh -m symlink -y         # dev symlinks, no prompt
    ./install-extensions.sh --backup --reload     # backup + restart Cinnamon
    ./install-extensions.sh --dry-run             # preview everything
    ./install-extensions.sh --uninstall -n '*clock*'

EXIT CODES:
    0  Success (or dry run completed)
    1  Bad arguments / usage / environment error
    2  No extensions matched the filters
EOF
}

# --- Argument parsing -----------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        -t|--type)
            case "${2:-}" in
                desklets|applets|all) TYPE="$2"; shift 2 ;;
                *) err "Invalid value for --type: '${2:-<missing>}'"; usage; exit 1 ;;
            esac
            ;;
        -n|--name)
            NAME_GLOB="${2:-}"
            if [ -z "$NAME_GLOB" ]; then
                err "--name requires a glob argument"; exit 1
            fi
            shift 2
            ;;
        -m|--mode)
            case "${2:-}" in
                copy|symlink) MODE="$2"; shift 2 ;;
                *) err "Invalid value for --mode: '${2:-<missing>}'"; usage; exit 1 ;;
            esac
            ;;
        -b|--backup)   BACKUP=true; shift ;;
        --dry-run)     DRY_RUN=true; shift ;;
        -y|--yes)      ASSUME_YES=true; shift ;;
        -r|--reload)   RELOAD=true; shift ;;
        --uninstall)   ACTION="uninstall"; shift ;;
        -h|--help)     usage; exit 0 ;;
        --) shift; break ;;
        -*) err "Unknown option: $1"; usage; exit 1 ;;
        *)  err "Unexpected argument: $1"; usage; exit 1 ;;
    esac
done

if [ "$ACTION" = "uninstall" ] && [ "$MODE" != "copy" ]; then
    err "--uninstall ignores --mode (it only removes targets)."
    exit 1
fi

# --- Environment sanity ---------------------------------------------------
if [ -z "${HOME:-}" ] || [ ! -d "$HOME" ]; then
    err "HOME is not set or does not exist."; exit 1
fi
if [ ! -d "$PROJECT_ROOT" ]; then
    err "Could not determine project root: $PROJECT_ROOT"; exit 1
fi

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        err "Required command not found: $1"; exit 1
    fi
}
require_cmd python3
[ "$MODE" = "copy" ] && require_cmd rsync

# --- Read a string field from metadata.json (python3 = always on Mint) ----
meta_field() {
    python3 - "$1" "$2" << 'PY'
import json, sys
try:
    with open(sys.argv[1]) as f:
        data = json.load(f)
except Exception:
    sys.exit(1)
val = data.get(sys.argv[2], "")
sys.stdout.write(val if isinstance(val, str) else "")
PY
}

# --- Discover extensions --------------------------------------------------
# Emits one line per extension:  <src_abs>\t<uuid>\t<type>\t<main_file>
discover() {
    local dir meta uuid xtype
    for dir in "$PROJECT_ROOT"/*@*; do
        [ -d "$dir" ] || continue
        meta="$dir/metadata.json"
        [ -f "$meta" ] || continue
        uuid="$(meta_field "$meta" "uuid" 2>/dev/null || true)"
        [ -z "$uuid" ] && continue
        if   [ -f "$dir/desklet.js" ]; then xtype="desklet"
        elif [ -f "$dir/applet.js" ];  then xtype="applet"
        else continue
        fi
        printf '%s\t%s\t%s\n' "$dir" "$uuid" "$xtype"
    done
}

mapfile -t ALL < <(discover)

# --- Filter ---------------------------------------------------------------
type_matches() {
    [ "$TYPE" = "all" ] && return 0
    local want="${TYPE%s}"   # desklets->desklet, applets->applet
    [ "$want" = "$1" ]
}

name_matches() {
    [ -z "$NAME_GLOB" ] && return 0
    local uuid="$1" srcname="$2"
    # shellcheck disable=SC2254
    case "$uuid" in    $NAME_GLOB) return 0 ;; esac
    # shellcheck disable=SC2254
    case "$srcname" in $NAME_GLOB) return 0 ;; esac
    return 1
}

SELECTED=()
for line in "${ALL[@]}"; do
    IFS=$'\t' read -r src uuid xtype <<<"$line"
    srcname="$(basename "$src")"
    if type_matches "$xtype" && name_matches "$uuid" "$srcname"; then
        SELECTED+=("$line")
    fi
done

if [ ${#SELECTED[@]} -eq 0 ]; then
    err "No extensions matched (type='$TYPE', name='${NAME_GLOB:-*}')."
    [ ${#ALL[@]} -eq 0 ] && err "Discovered 0 extensions under $PROJECT_ROOT"
    exit 2
fi

# --- Helpers --------------------------------------------------------------
target_dir() {
    case "$1" in
        desklet) printf '%s/%s' "$DESKLET_DIR" "$2" ;;
        applet)  printf '%s/%s' "$APPLET_DIR"  "$2" ;;
    esac
}

RSYNC_EXCLUDES=(
    --exclude='.git' --exclude='.gitignore'
    --exclude='.DS_Store' --exclude='Thumbs.db'
    --exclude='*.pyc' --exclude='__pycache__'
    --exclude='*.mo' --exclude='gschemas.compiled'
    --exclude='*.swp' --exclude='*.swo' --exclude='*~'
    --exclude='.vscode' --exclude='.idea'
)

do_remove() {
    local target="$1" label="$2"
    if [ -L "$target" ] || [ -e "$target" ]; then
        if $DRY_RUN; then act "REMOVE (dry-run):" "$label"
        else rm -rf "$target"; act "REMOVE:" "$label"; fi
    else
        skip "not installed: $label"
    fi
}

do_install() {
    local src="$1" uuid="$2" xtype="$3"
    local target label
    target="$(target_dir "$xtype" "$uuid")"
    label="$xtype/$uuid"

    if $DRY_RUN; then
        if [ "$MODE" = "symlink" ]; then act "SYMLINK (dry-run):" "$src -> $target"
        else                              act "COPY (dry-run):"    "$src/ -> $target/"; fi
        return 0
    fi

    case "$xtype" in
        desklet) mkdir -p "$DESKLET_DIR" ;;
        applet)  mkdir -p "$APPLET_DIR" ;;
    esac

    if [ "$MODE" = "symlink" ]; then
        if [ -L "$target" ]; then
            rm "$target"
        elif [ -d "$target" ]; then
            if $BACKUP; then
                mv "$target" "$target.bak.$(date +%Y%m%d%H%M%S)"
                warn "backed up existing dir -> $target.bak.*"
            else
                rm -rf "$target"
            fi
        elif [ -e "$target" ]; then
            rm -f "$target"
        fi
        ln -s "$src" "$target"
        ok "symlinked: $label"
        log "    ${C_CYAN}$target${C_RESET} -> $src"
        return 0
    fi

    # copy mode
    if [ -L "$target" ]; then
        rm "$target"; warn "replaced existing symlink: $label"
    elif [ -d "$target" ]; then
        if $BACKUP; then
            local bak="$target.bak.$(date +%Y%m%d%H%M%S)"
            mv "$target" "$bak"; warn "backed up existing install -> $bak"
        else
            rm -rf "$target"; warn "replaced existing install: $label"
        fi
    elif [ -e "$target" ]; then
        rm -f "$target"
    fi

    rsync -a "${RSYNC_EXCLUDES[@]}" "$src/" "$target/"
    ok "installed: $label"
    log "    ${C_CYAN}$target${C_RESET}"
}

# --- Summary / confirmation ----------------------------------------------
print_summary() {
    echo
    if [ "$ACTION" = "uninstall" ]; then
        log "${C_YELLOW}UNINSTALL${C_RESET} plan"
    else
        local filters="type: $TYPE"
        [ -n "$NAME_GLOB" ] && filters="$filters, name: '$NAME_GLOB'"
        log "${C_GREEN}INSTALL${C_RESET} plan (mode: $MODE, $filters)"
    fi
    for line in "${SELECTED[@]}"; do
        IFS=$'\t' read -r src uuid xtype <<<"$line"
        local target srcname
        target="$(target_dir "$xtype" "$uuid")"
        srcname="$(basename "$src")"
        printf '  %-42s -> %s\n' "$srcname" "$target"
    done
    if $BACKUP && [ "$ACTION" = "install" ] && [ "$MODE" = "copy" ]; then
        echo "  (existing installs will be backed up)"
    fi
    if $DRY_RUN; then
        echo "  ${C_YELLOW}(dry-run: nothing will be changed)${C_RESET}"
    fi
}

confirm() {
    if $DRY_RUN || $ASSUME_YES; then return 0; fi
    if [ ! -t 0 ]; then
        err "Non-interactive shell: pass -y/--yes to proceed."
        exit 1
    fi
    echo
    printf '%sProceed? [y/N] %s' "${C_BOLD}" "${C_RESET}"
    local reply; read -r reply
    case "$reply" in
        y|Y|yes|YES) return 0 ;;
        *) echo "Aborted."; exit 0 ;;
    esac
}

# --- Main -----------------------------------------------------------------
print_summary
confirm

for line in "${SELECTED[@]}"; do
    IFS=$'\t' read -r src uuid xtype <<<"$line"
    if [ "$ACTION" = "uninstall" ]; then
        do_remove "$(target_dir "$xtype" "$uuid")" "$xtype/$uuid"
    else
        do_install "$src" "$uuid" "$xtype"
    fi
done

echo
if $DRY_RUN; then
    ok "Dry run complete (no changes made)."
elif [ "$ACTION" = "uninstall" ]; then
    ok "Uninstall complete."
else
    ok "Install complete."
fi

if [ "$ACTION" = "install" ] && ! $DRY_RUN; then
    if $RELOAD; then
        log "Reloading Cinnamon..."
        if command -v cinnamon >/dev/null 2>&1; then
            ( cinnamon --replace >/dev/null 2>&1 & ) || true
            ok "Cinnamon reload triggered."
        else
            warn "'cinnamon' command not found; restart Cinnamon manually."
        fi
    else
        log "To activate/reload without a full restart:"
        log "  Win+L (Looking Glass) -> Extensions -> Reload Code"
        log "  or run: cinnamon --replace &"
    fi
fi

exit 0
