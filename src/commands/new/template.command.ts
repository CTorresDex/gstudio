import { join } from 'node:path'
import { Template } from '../../classes/Template.class.ts'
import { TemplateSource } from '../../classes/TemplateSource.class.ts'

export const help = {
    short: 'Scaffolds a template, ready to be written and installed',
    long: `Usage: gstudio new template <name> [--at <directory>]

Writes the manifest and scaffolding/, which is what a generated project gets.
Everything beside scaffolding/ stays in the template.

Arguments:
  <name>       the name the template is addressed by

Flags:
  --at         where to create it, instead of the current directory`,
}

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined) throw new Error('Usage: gstudio new template <name> [--at <directory>]')

    const target = await Template.scaffold(args[0], join(typeof context.flags.at === 'string' ? context.flags.at : process.cwd(), args[0]))

    console.log(`Created ${target}`)
    console.log(`Put what a generated project gets in ${target}/${Template.SCAFFOLDING}, then install it: gstudio install template ${target}`)
    console.log(`What a generated project needs installed goes in ${target}/${Template.INSTALL}`)
    console.log(`Everything beside ${Template.SCAFFOLDING}/ stays in the template, ${TemplateSource.MANIFEST} included`)
}
