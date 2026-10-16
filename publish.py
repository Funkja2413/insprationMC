#!/usr/bin/env python3
"""Validate the case library or prepend a researched batch without losing history."""

import argparse
from datetime import date
import json
import os
from pathlib import Path
import sys
import tempfile
from urllib.parse import urlsplit


REQUIRED_FIELDS = (
    "id", "title_zh", "brand", "agency", "region", "format", "date",
    "why_zh", "style_zh", "live_url", "source_url", "image", "mobile", "tags",
)


def read_json(path):
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def removed_ids(records):
    if not isinstance(records, list):
        raise ValueError("data/removed.json 必须是数组")
    result = set()
    for index, record in enumerate(records):
        case_id = record.get("id") if isinstance(record, dict) else record
        if not isinstance(case_id, str) or not case_id.strip():
            raise ValueError(f"删除记录第 {index + 1} 项缺少有效 id")
        result.add(case_id)
    return result


def case_id_of(case, label):
    if not isinstance(case, dict):
        raise ValueError(f"{label} 必须是对象")
    case_id = case.get("id")
    if not isinstance(case_id, str) or not case_id.strip():
        raise ValueError(f"{label} 缺少有效 id")
    return case_id


def validate_case(case, root, label):
    case_id = case_id_of(case, label)
    missing = [field for field in REQUIRED_FIELDS if field not in case]
    if missing:
        raise ValueError(f"{case_id} 缺少必需字段：{', '.join(missing)}")
    for field in REQUIRED_FIELDS:
        value = case[field]
        if field == "tags":
            valid = isinstance(value, list) and all(isinstance(tag, str) for tag in value)
        else:
            valid = isinstance(value, str)
        if not valid:
            raise ValueError(f"{case_id} 的 {field} 类型不正确")

    # Old live_url values can be empty or descriptive text; do not reinterpret them.
    image = case["image"]
    parts = urlsplit(image)
    if parts.scheme in ("http", "https") and parts.netloc:
        return case_id
    if not image or parts.scheme or parts.netloc or Path(image).is_absolute():
        raise ValueError(f"{case_id} 的 image 必须是仓库内相对路径或 HTTP(S) URL")
    asset = (root / image).resolve()
    try:
        asset.relative_to(root.resolve())
    except ValueError:
        raise ValueError(f"{case_id} 的图片路径超出仓库") from None
    if not asset.is_file():
        raise ValueError(f"{case_id} 的本地图片不存在：{image}")
    return case_id


def validate_document(document, root, excluded):
    if not isinstance(document, dict) or not isinstance(document.get("cases"), list):
        raise ValueError("data/cases.json 必须是包含 cases 数组的对象")
    cases = document["cases"]
    if type(document.get("count")) is not int or document["count"] != len(cases):
        raise ValueError(f"count 与 cases 条数不一致，实际应为 {len(cases)}")
    by_id = {}
    for index, case in enumerate(cases):
        case_id = validate_case(case, root, f"现有案例第 {index + 1} 项")
        if case_id in by_id:
            raise ValueError(f"重复 id：{case_id}")
        if case_id in excluded:
            raise ValueError(f"排除清单中的 id 被重新加入：{case_id}")
        by_id[case_id] = case
    return by_id


def write_json_atomic(path, document):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent, prefix=".cases-", delete=False
        ) as stream:
            temporary = Path(stream.name)
            json.dump(document, stream, ensure_ascii=False, indent=1)
            stream.write("\n")
        os.chmod(temporary, path.stat().st_mode & 0o777)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("batch", nargs="?", type=Path, help="新增案例 JSON 数组或含 cases 数组的对象")
    parser.add_argument("--check", action="store_true", help="只校验，不改写任何文件")
    parser.add_argument("--date", dest="updated", help="本次库更新日期 YYYY-MM-DD，不改变案例 date")
    args = parser.parse_args(argv)
    if args.check:
        if args.batch or args.updated:
            parser.error("--check 不可与批次文件或 --date 一起使用")
    elif args.batch is None or args.updated is None:
        parser.error("追加案例需要批次文件和 --date YYYY-MM-DD；只校验请用 --check")
    if args.updated:
        try:
            if date.fromisoformat(args.updated).isoformat() != args.updated:
                raise ValueError
        except ValueError:
            parser.error("--date 必须是有效的 YYYY-MM-DD 日期")

    root = Path(__file__).resolve().parent
    path = root / "data" / "cases.json"
    try:
        excluded = removed_ids(read_json(root / "data" / "removed.json"))
        document = read_json(path)
        by_id = validate_document(document, root, excluded)
        if args.check:
            print(f"校验通过：{len(by_id)} 条案例，{len(excluded)} 个排除 id。")
            return 0

        batch = read_json(args.batch)
        candidates = batch.get("cases") if isinstance(batch, dict) else batch
        if not isinstance(candidates, list):
            raise ValueError("批次文件必须是 JSON 数组或包含 cases 数组的对象")
        additions = []
        skipped_existing = skipped_excluded = 0
        for index, case in enumerate(candidates):
            case_id = case_id_of(case, f"新增案例第 {index + 1} 项")
            if case_id in excluded:
                skipped_excluded += 1
                continue
            if case_id in by_id:
                if by_id[case_id] != case:
                    raise ValueError(f"id 冲突且内容不同：{case_id}；未写入任何案例")
                skipped_existing += 1
                continue
            validate_case(case, root, f"新增案例第 {index + 1} 项")
            by_id[case_id] = case
            additions.append(case)

        if additions:
            updated = dict(document)
            updated["cases"] = additions + document["cases"]
            updated["count"] = len(updated["cases"])
            updated["updated"] = args.updated
            validate_document(updated, root, excluded)
            write_json_atomic(path, updated)
        print(
            f"新增 {len(additions)} 条；跳过相同案例 {skipped_existing} 条，"
            f"跳过排除案例 {skipped_excluded} 条；共 {len(by_id)} 条。"
        )
        return 0
    except (OSError, ValueError) as error:
        print(f"发布准备失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
