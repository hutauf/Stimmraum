import {sqliteTable,text,integer,primaryKey} from 'drizzle-orm/sqlite-core';
export const records=sqliteTable('records',{owner:text('owner').notNull(),id:text('id').notNull(),payload:text('payload').notNull(),updated:integer('updated').notNull()},t=>[primaryKey({columns:[t.owner,t.id]})]);
export const transcripts=sqliteTable('transcripts',{owner:text('owner').notNull(),id:text('id').notNull(),text:text('text').notNull()},t=>[primaryKey({columns:[t.owner,t.id]})]);
