import { join } from 'node:path'
import { Template } from '../../classes/Template.class.ts'
import { TemplateSource } from '../../classes/TemplateSource.class.ts'

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined) throw new Error('Usage: gstudio new template <name> [--at <directory>]')

    const target = await Template.scaffold(args[0], join(typeof context.flags.at === 'string' ? context.flags.at : process.cwd(), args[0]))

    console.log(`Created ${target}`)
    console.log(`Put what a generated project gets in ${target}/${Template.SCAFFOLDING}, then install it: gstudio install template ${target}`)
    console.log(`What a generated project needs installed goes in ${target}/${Template.INSTALL}`)
    console.log(`Everything beside ${Template.SCAFFOLDING}/ stays in the template, ${TemplateSource.MANIFEST} included`)
}
