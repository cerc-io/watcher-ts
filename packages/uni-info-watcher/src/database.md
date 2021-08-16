# database

## Hierarchical Queries

For fetching previous entity that would be updated at a particular blockHash, we need to traverse the parent hashes. As the same entity might be present on a different branch chain with different values. These branches occur in the frothy region and so a recursive query is done to get the blockHash of the previous entity in this region.

Let the blockHash be `0xBlockHash` and the entity id be `entityId`, then the hierarchical query is

```pgsql
WITH RECURSIVE cte_query AS
(
	SELECT
		b.block_hash,
		b.block_number,
		b.parent_hash,
		1 as depth,
		e.id
	FROM
		block_progress b
		LEFT JOIN
			entityTable e ON e.block_hash = b.block_hash
	WHERE
		b.block_hash = '0xBlockHash'
	UNION ALL
		SELECT
			b.block_hash,
			b.block_number,
			b.parent_hash,
			c.depth + 1,
			e.id
		FROM
			block_progress b
			LEFT JOIN
				${repo.metadata.tableName} e
				ON e.block_hash = b.block_hash
				AND e.id = 'entityId'
			INNER JOIN
				cte_query c ON c.parent_hash = b.block_hash
			WHERE
				c.id IS NULL AND c.depth < 16
)
SELECT
	block_hash, block_number, id
FROM
	cte_query
ORDER BY block_number ASC
LIMIT 1;
```

The second WHERE clause checks that the loop continues only till MAX_REORG_DEPTH `16` which specifies the frothy region or stop when the entity is found.

The resulting blockHash is then used to fetch the previous entity.

For fetching multiple entities, we fetch all the blockHashes in the frothy region. So it fetches the entities from the correct branch in the frothy and then from the pruned region.

Hierarchical query for getting blockHashes in the frothy region

```pgsql
WITH RECURSIVE cte_query AS
(
	SELECT
		block_hash,
		block_number,
		parent_hash,
		1 as depth
	FROM
		block_progress
	WHERE
		block_hash = '0xBlockHash'
	UNION ALL
		SELECT
			b.block_hash,
			b.block_number,
			b.parent_hash,
			c.depth + 1
		FROM
			block_progress b
		INNER JOIN
			cte_query c ON c.parent_hash = b.block_hash
		WHERE
			c.depth < 16
)
SELECT
	block_hash, block_number
FROM
	cte_query;
```
