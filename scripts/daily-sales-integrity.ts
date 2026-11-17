// Read-only production integrity check. Never changes or prints financial values/credentials.
import 'dotenv/config';
import { Pool } from 'pg';
const pool=new Pool({connectionString:process.env.DATABASE_URL});
try{
 const duplicates=await pool.query('SELECT "restaurantId",date::text,count(*)::int AS records FROM "DailySales" GROUP BY "restaurantId",date HAVING count(*)>1');
 const indexes=await pool.query(`SELECT i.indisunique,i.indisvalid,i.indpred IS NULL AS whole_table,i.indexprs IS NULL AS plain_columns,ARRAY(SELECT a.attname FROM unnest(i.indkey) WITH ORDINALITY k(attnum,ordinal) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum ORDER BY k.ordinal)::text[] AS columns,pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname='DailySales_restaurantId_date_key' AND i.indrelid='"DailySales"'::regclass`);
 const columns=await pool.query(`SELECT column_name,is_nullable,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='DailySales' AND column_name IN ('restaurantId','date') ORDER BY column_name`);
 console.log(JSON.stringify({duplicateGroups:duplicates.rows,uniqueIndex:indexes.rows,ownershipColumns:columns.rows},null,2));
 if(duplicates.rowCount||indexes.rows.length!==1||!indexes.rows[0].indisunique||!indexes.rows[0].indisvalid||!indexes.rows[0].whole_table||!indexes.rows[0].plain_columns||JSON.stringify(indexes.rows[0].columns)!==JSON.stringify(['restaurantId','date'])||columns.rows.length!==2||columns.rows.some(row=>row.is_nullable!=='NO')||!columns.rows.some(row=>row.column_name==='date'&&row.data_type==='date'))process.exitCode=1;
}finally{await pool.end();}
