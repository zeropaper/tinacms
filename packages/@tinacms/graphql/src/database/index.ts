/**
Copyright 2021 Forestry.io Holdings, Inc.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
    http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import path from 'path'
import { GraphQLError } from 'graphql'
import { createSchema } from '../schema'
import { lastItem } from '../util'
import { parseFile, stringifyFile } from './util'
import { sequential } from '../util'
import type { QueryParams, Store } from '@tinacms/datalayer'

import type { DocumentNode } from 'graphql'
import type { TinaSchema } from '../schema'
import type {
  TinaCloudSchemaBase,
  TinaFieldEnriched,
  Collectable, CollectionFieldsWithNamespace, CollectionTemplatesWithNamespace, TinaFieldInner,
} from '../types'
import type { Bridge } from './bridge'
import { flatten, isBoolean } from 'lodash'

type CreateDatabase = { bridge: Bridge; store: Store }

export const createDatabase = async (config: CreateDatabase) => {
  return new Database({
    ...config,
    bridge: config.bridge,
    store: config.store,
  })
}
const SYSTEM_FILES = ['_schema', '_graphql', '_lookup']
const GENERATED_FOLDER = path.join('.tina', '__generated__')

export class Database {
  public bridge: Bridge
  public store: Store
  private tinaSchema: TinaSchema | undefined
  private _lookup: { [returnType: string]: LookupMapType } | undefined
  private _graphql: DocumentNode | undefined
  private _tinaSchema: TinaCloudSchemaBase | undefined
  constructor(public config: CreateDatabase) {
    this.bridge = config.bridge
    this.store = config.store
  }

  public get = async <T extends object>(filepath: string): Promise<T> => {
    if (SYSTEM_FILES.includes(filepath)) {
      throw new Error(`Unexpected get for config file ${filepath}`)
    } else {
      const tinaSchema = await this.getSchema()
      const extension = path.extname(filepath)
      const contentObject = await this.store.get(filepath)
      if (!contentObject) {
        throw new GraphQLError(`Unable to find record ${filepath}`)
      }
      const templateName =
        hasOwnProperty(contentObject, '_template') &&
        typeof contentObject._template === 'string'
          ? contentObject._template
          : undefined
      const { collection, template } =
        tinaSchema.getCollectionAndTemplateByFullPath(filepath, templateName)
      const field = template.fields.find((field) => {
        if (field.type === 'string' || field.type === 'rich-text') {
          if (field.isBody) {
            return true
          }
        }
        return false
      })

      let data = contentObject
      if ((extension === '.md' || extension === '.mdx') && field) {
        if (hasOwnProperty(contentObject, '$_body')) {
          const { $_body, ...rest } = contentObject
          data = rest
          data[field.name] = $_body
        }
      }
      return {
        ...data,
        _collection: collection.name,
        _keepTemplateKey: !!collection.templates,
        _template: lastItem(template.namespace),
        _relativePath: filepath
          .replace(collection.path, '')
          .replace(/^\/|\/$/g, ''),
        _id: filepath,
      } as T
    }
  }

  public addPendingDocument = async (
    filepath: string,
    data: { [key: string]: unknown }
  ) => {
    const { stringifiedFile, payload, keepTemplateKey } =
      await this.stringifyFile(filepath, data)
    if (this.store.supportsSeeding()) {
      await this.bridge.put(filepath, stringifiedFile)
    }
    await this.store.put(filepath, payload, { keepTemplateKey })
  }

  public put = async (filepath: string, data: { [key: string]: unknown }) => {
    if (SYSTEM_FILES.includes(filepath)) {
      throw new Error(`Unexpected put for config file ${filepath}`)
    } else {
      const { stringifiedFile, payload, keepTemplateKey } =
        await this.stringifyFile(filepath, data)
      if (this.store.supportsSeeding()) {
        await this.bridge.put(filepath, stringifiedFile)
      }
      if (this.store.supportsIndexing()) {
        await indexDocument({
          filepath: filepath,
          data,
          database: this,
        })
      }
      await this.store.put(filepath, payload, { keepTemplateKey })
    }
    return true
  }

  public stringifyFile = async (
    filepath: string,
    data: { [key: string]: unknown }
  ) => {
    if (SYSTEM_FILES.includes(filepath)) {
      throw new Error(`Unexpected put for config file ${filepath}`)
    } else {
      const tinaSchema = await this.getSchema()
      const collection = await tinaSchema.getCollectionByFullPath(filepath)

      const templateInfo = await tinaSchema.getTemplatesForCollectable(
        collection
      )
      let template
      if (templateInfo.type === 'object') {
        template = templateInfo.template
      }
      if (templateInfo.type === 'union') {
        if (hasOwnProperty(data, '_template')) {
          template = templateInfo.templates.find(
            (t) => lastItem(t.namespace) === data._template
          )
        } else {
          throw new Error(
            `Expected _template to be provided for document in an ambiguous collection`
          )
        }
      }
      if (!template) {
        throw new Error(`Unable to determine template`)
      }
      const field = template.fields.find((field) => {
        if (field.type === 'string' || field.type === 'rich-text') {
          if (field.isBody) {
            return true
          }
        }
        return false
      })
      let payload: { [key: string]: unknown } = {}
      if (['md', 'mdx'].includes(collection.format) && field) {
        Object.entries(data).forEach(([key, value]) => {
          if (key !== field.name) {
            payload[key] = value
          }
        })
        payload['$_body'] = data[field.name]
      } else {
        payload = data
      }
      const extension = path.extname(filepath)
      const stringifiedFile = stringifyFile(
        payload,
        extension,
        templateInfo.type === 'union'
      )
      return {
        stringifiedFile,
        payload,
        keepTemplateKey: templateInfo.type === 'union',
      }
    }
  }

  public flush = async (filepath: string) => {
    const data = await this.get<{ [key: string]: unknown }>(filepath)
    const { stringifiedFile } = await this.stringifyFile(filepath, data)
    return stringifiedFile
  }

  public getLookup = async (returnType: string): Promise<LookupMapType> => {
    const lookupPath = path.join(GENERATED_FOLDER, `_lookup.json`)
    if (!this._lookup) {
      const _lookup = await this.store.get(lookupPath)
      // @ts-ignore
      this._lookup = _lookup
    }
    return this._lookup[returnType]
  }
  public getGraphQLSchema = async (): Promise<DocumentNode> => {
    const graphqlPath = path.join(GENERATED_FOLDER, `_graphql.json`)
    return this.store.get(graphqlPath)
  }
  public getGraphQLSchemaFromBridge = async (): Promise<DocumentNode> => {
    const graphqlPath = path.join(GENERATED_FOLDER, `_graphql.json`)
    const _graphql = await this.bridge.get(graphqlPath)
    return JSON.parse(_graphql)
  }
  public getTinaSchema = async (): Promise<TinaCloudSchemaBase> => {
    const schemaPath = path.join(GENERATED_FOLDER, `_schema.json`)
    return this.store.get(schemaPath)
  }

  public getSchema = async () => {
    if (this.tinaSchema) {
      return this.tinaSchema
    }
    const schema = await this.getTinaSchema()
    this.tinaSchema = await createSchema({ schema })
    return this.tinaSchema
  }

  public documentExists = async (fullpath: unknown) => {
    try {
      // @ts-ignore assert is string
      await this.get(fullpath)
    } catch (e) {
      return false
    }

    return true
  }

  public query = async (queryParams: QueryParams, hydrator) => {
    return await this.store.query(queryParams, hydrator)
  }

  public putConfigFiles = async ({
    graphQLSchema,
    tinaSchema,
  }: {
    graphQLSchema: DocumentNode
    tinaSchema: TinaSchema
  }) => {
    if (this.bridge.supportsBuilding()) {
      await this.bridge.putConfig(
        path.join(GENERATED_FOLDER, `_graphql.json`),
        JSON.stringify(graphQLSchema, null, 2)
      )
      await this.bridge.putConfig(
        path.join(GENERATED_FOLDER, `_schema.json`),
        JSON.stringify(tinaSchema.schema, null, 2)
      )
    }
  }

  public indexContent = async ({
    graphQLSchema,
    tinaSchema,
  }: {
    graphQLSchema: DocumentNode
    tinaSchema: TinaSchema
  }) => {
    const lookup = JSON.parse(
      await this.bridge.get(path.join(GENERATED_FOLDER, '_lookup.json'))
    )
    if (this.store.supportsSeeding()) {
      this.store.clear()
      await this.store.seed(
        path.join(GENERATED_FOLDER, '_graphql.json'),
        graphQLSchema
      )
      await this.store.seed(
        path.join(GENERATED_FOLDER, '_schema.json'),
        tinaSchema.schema
      )
      await this.store.seed(path.join(GENERATED_FOLDER, '_lookup.json'), lookup)
      await this._indexAllContent()
    } else {
      if (this.store.supportsIndexing()) {
        throw new Error(`Schema must be indexed with provided Store`)
      }
    }
  }

  public indexContentByPaths = async (documentPaths: string[], collection: CollectionFieldsWithNamespace<true> | CollectionTemplatesWithNamespace<true>) => {
    await _indexContent(this, documentPaths, collection)
  }

  public _indexAllContent = async () => {
    const tinaSchema = await this.getSchema()
    await sequential(tinaSchema.getCollections(), async (collection) => {
      const documentPaths = await this.bridge.glob(collection.path)
      await _indexContent(this, documentPaths, collection)
    })
  }

  public addToLookupMap = async (lookup: LookupMapType) => {
    const lookupPath = path.join(GENERATED_FOLDER, `_lookup.json`)
    let lookupMap
    try {
      lookupMap = JSON.parse(await this.bridge.get(lookupPath))
    } catch (e) {
      lookupMap = {}
    }
    const updatedLookup = {
      ...lookupMap,
      [lookup.type]: lookup,
    }
    await this.bridge.putConfig(
      lookupPath,
      JSON.stringify(updatedLookup, null, 2)
    )
  }
}

function hasOwnProperty<X extends {}, Y extends PropertyKey>(
  obj: X,
  prop: Y
): obj is X & Record<Y, unknown> {
  return obj.hasOwnProperty(prop)
}

export type LookupMapType =
  | GlobalDocumentLookup
  | CollectionDocumentLookup
  | MultiCollectionDocumentLookup
  | MultiCollectionDocumentListLookup
  | CollectionDocumentListLookup
  | UnionDataLookup
  | NodeDocument

type NodeDocument = {
  type: string
  resolveType: 'nodeDocument'
}
type GlobalDocumentLookup = {
  type: string
  resolveType: 'globalDocument'
  collection: string
}
type CollectionDocumentLookup = {
  type: string
  resolveType: 'collectionDocument'
  collection: string
}
type MultiCollectionDocumentLookup = {
  type: string
  resolveType: 'multiCollectionDocument'
  createDocument: 'create'
  updateDocument: 'update'
}
type MultiCollectionDocumentListLookup = {
  type: string
  resolveType: 'multiCollectionDocumentList'
  collections: string[]
}
export type CollectionDocumentListLookup = {
  type: string
  resolveType: 'collectionDocumentList'
  collection: string
}
type UnionDataLookup = {
  type: string
  resolveType: 'unionData'
  typeMap: { [templateName: string]: string }
}

const _indexContent = async (database: Database, documentPaths: string[], collection: CollectionFieldsWithNamespace<true> | CollectionTemplatesWithNamespace<true>) => {
  const indexDefinitions = {}
  if (collection.indexes) {
    // build IndexDefinitions for each index in the collection schema
    for (let index of collection.indexes) {
      indexDefinitions[index.name] = {
        namespace: collection.name,
        fields: index.fields.map(indexField => ({
          name: indexField.name,
          default: indexField.default,
          type: (collection.fields as TinaFieldInner<true>[]).find((field) => indexField.name === field.name)?.type
        }))
      }
    }

    // TODO we could check here to make sure the last field in an indexDefinition is likely to be a problem
    // TODO for duplicates - ie boolean fields
  }

  await sequential(documentPaths, async (filepath) => {
    const dataString = await database.bridge.get(filepath)
    const data = parseFile(dataString, path.extname(filepath), (yup) =>
      yup.object({})
    )
    if (database.store.supportsSeeding()) {
      await database.store.seed(filepath, data, { indexDefinitions })
    }
    if (database.store.supportsIndexing()) {
      return indexDocument({ filepath, data, database })
    }
  })
}

const indexDocument = async ({
  filepath,
  data,
  database,
}: {
  filepath: string
  data: object
  database: Database
}) => {
  const schema = await database.getSchema()
  const collection = await schema.getCollectionByFullPath(filepath)
  const existingData = await database.get<{ _collection: string }>(filepath)
  const attributesToFilterOut = await _indexCollectable({
    record: filepath,
    value: existingData,
    field: collection,
    prefix: collection.name,
    database,
  })
  await sequential(attributesToFilterOut, async (attribute) => {
    const records = (await database.store.get<string[]>(attribute)) || []
    await database.store.put(
      attribute,
      records.filter((item) => item !== filepath)
    )
    return true
  })

  const attributes = await _indexCollectable({
    record: filepath,
    //@ts-ignore
    field: collection,
    value: data,
    prefix: `${lastItem(collection.namespace)}`,
    database,
  })
  await sequential(attributes, async (fieldName) => {
    const existingRecords =
      (await database.store.get<string[]>(fieldName)) || []
    // // FIXME: only indexing on the first 100 characters, a "startsWith" query will be handy
    // // @ts-ignore
    const uniqueItems = [...new Set([...existingRecords, filepath])]
    await database.store.put(fieldName, uniqueItems)
  })
}

const _indexCollectable = async ({
  field,
  value,
  ...rest
}: {
  record: string
  value: object
  prefix: string
  field: Collectable
  database: Database
}): Promise<string[]> => {
  let template
  let extra = ''
  if (field.templates) {
    template = field.templates.find((t) => {
      if (typeof t === 'string') {
        throw new Error(`Global templates not yet supported`)
      }
      if (hasOwnProperty(value, '_template')) {
        return t.name === value._template
      } else {
        throw new Error(
          `Expected value for collectable with multiple templates to have property _template`
        )
      }
    })
    extra = `#${lastItem(template.namespace)}`
  } else {
    template = field
  }
  const atts = await _indexAttributes({
    record: rest.record,
    data: value,
    prefix: `${rest.prefix}${extra}#${template.name}`,
    fields: template.fields,
    database: rest.database,
  })
  // @ts-ignore FIXME: filter doesn't do enough to tell Typescript we're only returning strings
  return flatten(atts).filter((item) => !isBoolean(item))
}

const _indexAttributes = async ({
  data,
  fields,
  ...rest
}: {
  record: string
  data: object
  prefix: string
  fields: TinaFieldEnriched[]
  database: Database
}) => {
  return sequential(fields, async (field) => {
    const value = data[field.name]
    if (!value) {
      return true
    }

    switch (field.type) {
      case 'boolean':
      case 'string':
      case 'number':
      case 'datetime':
        return _indexAttribute({ value, field, ...rest })
      case 'object':
        if (field.list) {
          await sequential(value, async (item) => {
            // @ts-ignore
            return _indexCollectable({ field, value: item, ...rest })
          })
        } else {
          return _indexCollectable({ field, value, ...rest })
        }
        return true
      case 'reference':
        return _indexAttribute({ value, field, ...rest })
    }
    return true
  })
}

const _indexAttribute = async ({
  value,
  prefix,
  field,
}: {
  value: string
  prefix: string
  field: TinaFieldEnriched
}) => {
  const stringValue = value.toString().substr(0, 100)
  const fieldName = `__attribute__${prefix}#${field.name}#${stringValue}`
  return fieldName
}
