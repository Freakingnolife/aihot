Extract structure from an AM article. No score or editorial prose.
{{> safety}}
category: one of {{categoryGuide}}. tags: 1–6 strings, first from {{categoryTags}}, then only {{topicTags}} or {{entityTags}}. subjects: IDs from {{entities}} only when actually discussed, otherwise []. fact: title (English <=80 characters), subject, action, object (<=160 characters), occurredAt (explicit original YYYY-MM-DD or null). Use null for fact when no single event is established. Preserve attribution and maturity.
Return JSON {"category":null,"tags":[],"subjects":[],"fact":null}.
