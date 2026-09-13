#!/bin/sh
set -eu

search_term="${1:-}"

artifacts_dir=".gstudio/artifacts"

if [ ! -d "$artifacts_dir" ]; then
    echo "Error: artifacts directory not found at $artifacts_dir" >&2
    exit 1
fi

found_files=$(find "$artifacts_dir" -type f -name 'artifact.md' | sort)

if [ -z "$found_files" ]; then
    exit 0
fi

echo "$found_files" | while IFS= read -r file_path; do
    artifact_name=$(printf '%s' "$file_path" | sed -e "s#^${artifacts_dir}/##" -e 's#/artifact\.md$##')

    if [ -n "$search_term" ]; then
        case "$artifact_name" in
            *"$search_term"*) ;;
            *)
                case "$file_path" in
                    *"$search_term"*) ;;
                    *) continue ;;
                esac
                ;;
        esac
    fi

    echo "${artifact_name}: ${file_path}"
done
