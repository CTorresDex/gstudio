import { Ledger } from '../../classes/Ledger.class.ts'
import { TemplateSource } from '../../classes/TemplateSource.class.ts'
import { TemplateRegistry } from '../../classes/TemplateRegistry.class.ts'

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    const registry = await TemplateRegistry.load()
    const ledger = await Ledger.load(process.cwd())
    const aliases = Object.keys(registry.sources).filter((alias) => registry.sources[alias]!.features.length > 0 && (args[0] === undefined || alias.includes(args[0]) || registry.sources[alias]!.features.some((name) => name.includes(args[0]!)))).sort()

    if (ledger.names.length > 0) {
        console.log('Installed in this project:')

        for (const name of ledger.names) {
            const entry = ledger.entry(name)!

            console.log(`  ${name}${entry.version === null ? '' : ` ${entry.version}`}  ${TemplateSource.origin(entry.url, entry.sha)}${entry.explicit ? '' : `  (required by ${ledger.dependents(name).join(', ')})`}`)
        }

        console.log('')
    }

    if (aliases.length === 0) return console.log(args[0] === undefined ? 'No installed source provides features. Install one with: gstudio install template <git-url>' : `No installed source matches ${args[0]}`)

    for (const alias of aliases) {
        console.log(`${alias}  ${registry.sources[alias]!.url}  ${registry.sources[alias]!.sha === null ? 'linked' : `${registry.sources[alias]!.ref ?? 'HEAD'} at ${TemplateSource.commit(registry.sources[alias]!.sha)}`}`)

        for (const name of registry.sources[alias]!.features)
            console.log(`  ${alias}/${name}${registry.providers('feature', name).length > 1 ? registry.shortcuts.feature[name] === `${alias}/${name}` ? `  (${name})` : '  (ambiguous)' : `  (${name})`}${ledger.entry(name) === undefined ? '' : '  installed'}`)
    }
}
