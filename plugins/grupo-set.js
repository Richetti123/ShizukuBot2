import fs from 'fs/promises'
import path from 'path'

const CONFIG_FILE = path.resolve('./src/configuraciones.json')
const BACKUP_DIR = path.resolve('./src/backupsconfig/')
const confirmDeletes = {}  // Para confirmación de borrado
const confirmSets = {}     // Para confirmación de sobrescritura en set
const confirmImports = {}  // Para confirmación de sobrescritura en import

// Asegura que la carpeta de backups exista
async function ensureBackupDir() {
  try {
    await fs.access(BACKUP_DIR)
  } catch {
    await fs.mkdir(BACKUP_DIR, { recursive: true })
  }
}

// Normaliza nombre para que 'general', 'grupo', 'grupal' sean equivalentes
function normalizeName(name) {
  if (!name) return 'general'
  const n = name.toLowerCase()
  if (['general', 'grupo', 'grupal'].includes(n)) return 'general'
  return n
}

async function readConfigTypes() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

async function addConfigType(type) {
  const types = await readConfigTypes()
  if (!types.includes(type)) {
    types.push(type)
    await fs.writeFile(CONFIG_FILE, JSON.stringify(types, null, 2), 'utf-8')
  }
}

async function saveConfigTypes(types) {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(types, null, 2), 'utf-8')
}

let handler = async (m, { conn, usedPrefix, command, args, isAdmin }) => {
  let chat = global.db.data.chats[m.chat] ||= {}
  chat.configs ||= {}

  const typeRaw = args[0]?.toLowerCase()
  let nameRaw = args[1] || ''
  const type = typeRaw
  const name = normalizeName(nameRaw)

  // -- SET CONFIG --
  if (command.match(/^(setcfg|setconfig|s|set)$/i)) {
    if (!type) throw `╰⊱❗️⊱ *USO INCORRECTO* ⊱❗️⊱╮\n\nEjemplo:\n${usedPrefix}${command} pagos general texto a guardar\nO para imagen y texto:\n${usedPrefix}${command} pagos general texto_imagen texto_a_guardar`

    const rest = args.slice(2)
    let value = rest.join(' ').trim()

    chat.configs[type] ||= {}

    // Revisar si ya existe configuración para ese tipo+nombre
    let exists = chat.configs[type][name]

    // Si existe y no hay confirmación previa, pide confirmación
    if (exists && !confirmSets[m.sender]) {
      if (exists.author !== m.sender) {
        return conn.reply(m.chat, `❌ Solo quien configuró *${type.toUpperCase()} (${name})* puede modificarla.`, m)
      }
      confirmSets[m.sender] = { type, name, value }
      return conn.reply(m.chat, `⚠️ Ya existe configuración para *${type.toUpperCase()} (${name})*.\nSi quieres cambiarla, vuelve a enviar el mismo comando para confirmar.`, m)
    }

    // Si ya pidió confirmación pero cambió tipo o nombre, se actualiza confirmación
    if (confirmSets[m.sender] && (confirmSets[m.sender].type !== type || confirmSets[m.sender].name !== name)) {
      if (exists.author !== m.sender) {
        return conn.reply(m.chat, `❌ Solo quien configuró *${type.toUpperCase()} (${name})* puede modificarla.`, m)
      }
      confirmSets[m.sender] = { type, name, value }
      return conn.reply(m.chat, `⚠️ Confirmación cambiada.\nSi quieres cambiar la configuración *${type.toUpperCase()} (${name})*, vuelve a enviar el comando.`, m)
    }

    // Ahora manejar la configuración
    const q = m.quoted ? m.quoted : m
    const mime = (q.msg || q).mimetype || ''

    // Tipos permitidos: image, text, image_text
    // Detectar qué tipo quiere guardar:
    // Si mime es imagen y value está vacío: guardar solo imagen
    // Si mime no es imagen y value tiene texto: solo texto
    // Si mime es imagen y value tiene texto: imagen y texto

    let configToSave = null
    if (mime.startsWith('image') && value) {
      // imagen y texto
      let buffer = await q.download()
      if (!buffer) throw '❌ No se pudo descargar la imagen.'
      let base64 = buffer.toString('base64')
      configToSave = { type: 'image_text', image: base64, text: value, author: m.sender }
    } else if (mime.startsWith('image')) {
      // solo imagen
      let buffer = await q.download()
      if (!buffer) throw '❌ No se pudo descargar la imagen.'
      let base64 = buffer.toString('base64')
      configToSave = { type: 'image', content: base64, author: m.sender }
    } else if (value) {
      // solo texto
      configToSave = { type: 'text', content: value, author: m.sender }
    } else {
      throw `❌ Envía un texto o responde a una imagen para configurar ${type.toUpperCase()} con el nombre "${name}".`
    }

    // Guardar
    chat.configs[type][name] = configToSave
    await addConfigType(type)

    delete confirmSets[m.sender]

    return conn.reply(m.chat, `✅ Configuración de *${type.toUpperCase()} (${name})* guardada correctamente.`, m)
  }

  // -- VER CONFIG --
  if (command.match(/^(vercfg|verconfig|v)$/i)) {
    const allowedCommands = await readConfigTypes()
    if (!type) return m.reply(`╰⊱❗️⊱ *USO INCORRECTO* ⊱❗️⊱╮\n\nUsa:\n${usedPrefix}${command} <tipo> [nombre]\n\nEjemplo:\n${usedPrefix}${command} pagos\n${usedPrefix}${command} pagos general`)

    if (!allowedCommands.includes(type)) return m.reply(`╰⊱❌⊱ *NO CONFIGURADO* ⊱❌⊱╮\n\nEl apartado "${type}" no está configurado.`)

    let configsOfType = chat.configs[type]
    if (!configsOfType) return m.reply(`╰⊱📭⊱ *VACÍO* ⊱📭⊱╮\n\nNo hay configuraciones para *${type.toUpperCase()}*.`)

    if (!nameRaw) {
      let keys = Object.keys(configsOfType)
      if (!keys.length) return m.reply(`╰⊱📭⊱ *VACÍO* ⊱📭⊱╮\n\nNo hay configuraciones para *${type.toUpperCase()}*.`)
      return m.reply(`╰⊱📌⊱ *DISPONIBLES* ⊱📌⊱╮\n\nConfiguraciones para *${type.toUpperCase()}*:\n${keys.map(k => `◦ ${k}`).join('\n')}`)
    }

    let entry = configsOfType[name]
    if (!entry) return m.reply(`╰⊱❌⊱ *NO CONFIGURADO* ⊱❌⊱╮\n\nNo se encontró configuración para *${type.toUpperCase()} (${name})*.`)

    if (entry.type === 'image') {
      try {
        let buffer = Buffer.from(entry.content, 'base64')
        await conn.sendFile(m.chat, buffer, `${type}-${name}.jpg`, `AQUÍ TIENES LOS *${type.toUpperCase()} DE ${name}*`, m)
      } catch {
        return m.reply(`╰⊱❌⊱ *ERROR* ⊱❌⊱╮\n\nError al enviar la imagen configurada para *${type.toUpperCase()} (${name})*.`)
      }
    } else if (entry.type === 'text') {
      return m.reply(entry.content)
    } else if (entry.type === 'image_text') {
      try {
        let buffer = Buffer.from(entry.image, 'base64')
        await conn.sendFile(m.chat, buffer, `${type}-${name}.jpg`, entry.text, m)
      } catch {
        return m.reply(`╰⊱❌⊱ *ERROR* ⊱❌⊱╮\n\nError al enviar la imagen con texto configurada para *${type.toUpperCase()} (${name})*.`)
      }
    }
  }

  // -- BORRAR CONFIG --
  if (command.match(/^(delcfg|delconfig|deletecfg|deleteconfig)$/i)) {
    if (!type) return m.reply(`╰⊱❗️⊱ *USO INCORRECTO* ⊱❗️⊱╮\n\nUsa:\n${usedPrefix}${command} <tipo> [nombre]\n\nEjemplo:\n${usedPrefix}${command} pagos general`)
    if (!chat.configs[type]?.[name]) return m.reply(`╰⊱❌⊱ *NO CONFIGURADO* ⊱❌⊱╮\n\nNo hay configuración para *${type.toUpperCase()} (${name})* para borrar.`)

    // Si no es general, verifica autor
    if (name !== 'general' && chat.configs[type][name].author !== m.sender) {
      return m.reply(`╰⊱❌⊱ *PERMISO DENEGADO* ⊱❌⊱╮\n\nSolo quien configuró *${type.toUpperCase()} (${name})* puede borrarlo.`)
    }

    // Confirmación de borrado
    if (!confirmDeletes[m.sender]) {
      confirmDeletes[m.sender] = { type, name }
      return conn.reply(m.chat, `⚠️ *CONFIRMA EL BORRADO* ⚠️\n\n¿Quieres borrar la configuración *${type.toUpperCase()} (${name})*?\n\nUsa de nuevo el comando para confirmar.`, m)
    }

    if (confirmDeletes[m.sender].type !== type || confirmDeletes[m.sender].name !== name) {
      confirmDeletes[m.sender] = { type, name }
      return conn.reply(m.chat, `⚠️ *CONFIRMACIÓN CAMBIADA* ⚠️\n\n¿Quieres borrar la configuración *${type.toUpperCase()} (${name})*?\n\nUsa de nuevo el comando para confirmar.`, m)
    }

    // Borra configuración y limpia objetos vacíos
    delete chat.configs[type][name]
    if (Object.keys(chat.configs[type]).length === 0) delete chat.configs[type]

    // Si no hay más configs de ese tipo en el chat, borrar del archivo JSON
    let types = await readConfigTypes()
    if (types.includes(type)) {
      types = types.filter(t => t !== type)
      await saveConfigTypes(types)
    }

    delete confirmDeletes[m.sender]

    return conn.reply(m.chat, `✅ *Configuración ${type.toUpperCase()} (${name}) eliminada correctamente.*`, m)
  }

  // -- LISTAR CONFIGURACIONES --
  if (command.match(/^(listcfg|listconfig|listacfg|listaconfig)$/i)) {
    const allConfigs = chat.configs
    let response = '╰⊱📋⊱ *CONFIGURACIONES EN ESTE GRUPO* ⊱📋⊱╮\n\n'
    let count = 0

    for (let type in allConfigs) {
      for (let name in allConfigs[type]) {
        response += `.vercfg ${type} ${name}\n`
        count++
      }
    }

    if (count === 0) {
      return m.reply(`╰⊱📭⊱ *VACÍO* ⊱📭⊱╮\n\nNo hay configuraciones guardadas.`)
    }

    return m.reply(response)
  }

  // -- EXPORTAR CONFIG --
  if (command.match(/^exportcfg$/i)) {
    if (!type) return m.reply(`╰⊱❗️⊱ *USO INCORRECTO* ⊱❗️⊱╮\n\nUsa:\n${usedPrefix}${command} <nombreBackup>\n\nEjemplo:\n${usedPrefix}${command} Grupo richetti`)

    await ensureBackupDir()
    const filename = typeRaw.replace(/\s+/g, '').toLowerCase() + '.json'
    const backupPath = path.join(BACKUP_DIR, filename)

    const configsToExport = chat.configs || {}

    if (!configsToExport || Object.keys(configsToExport).length === 0) {
      return m.reply('❌ No hay configuraciones para exportar en este grupo.')
    }

    await fs.writeFile(backupPath, JSON.stringify(configsToExport, null, 2), 'utf-8')
    return m.reply(`✅ Configuración exportada correctamente como *${filename}* en backupsconfig.`)
  }

  // -- IMPORTAR CONFIG --
  if (command.match(/^importcfg$/i)) {
    if (!type) return m.reply(`╰⊱❗️⊱ *USO INCORRECTO* ⊱❗️⊱╮\n\nUsa:\n${usedPrefix}${command} <nombreBackup>\n\nEjemplo:\n${usedPrefix}${command} grupo richetti`)

    await ensureBackupDir()
    const filename = typeRaw.replace(/\s+/g, '').toLowerCase() + '.json'
    const backupPath = path.join(BACKUP_DIR, filename)

    try {
      const data = await fs.readFile(backupPath, 'utf-8')
      const importedConfigs = JSON.parse(data)

      if (chat.configs && Object.keys(chat.configs).length > 0) {
        // Hay configs, pide confirmación para sobreescribir
        if (!confirmImports[m.sender]) {
          if (!isAdmin) return m.reply('❌ Solo administradores pueden confirmar la importación y sobrescritura.')
          confirmImports[m.sender] = true
          return m.reply('⚠️ Ya hay configuraciones en este grupo.\nSi quieres sobrescribirlas con la importación, usa el comando de nuevo para confirmar.')
        }
      }

      // Sobrescribe configs del grupo con las importadas
      chat.configs = importedConfigs

      // Actualiza types en archivo principal
      let allTypes = Object.keys(importedConfigs)
      await saveConfigTypes(allTypes)

      delete confirmImports[m.sender]

      return m.reply(`✅ Configuración importada correctamente desde *${filename}*.`)
    } catch {
      return m.reply(`❌ No se encontró el archivo de backup *${filename}* en backupsconfig.`)
    }
  }
}

handler.command = [
  /^setcfg$/i, /^setconfig$/i, /^set$/i,
  /^vercfg$/i, /^verconfig$/i, /^v$/i,
  /^delcfg$/i, /^delconfig$/i, /^deletecfg$/i, /^deleteconfig$/i,
  /^listcfg$/i, /^listconfig$/i, /^listacfg$/i, /^listaconfig$/i,
  /^exportcfg$/i,
  /^importcfg$/i
]
handler.group = true
handler.admin = false // Solo algunas acciones necesitan admin internamente

export default handler
