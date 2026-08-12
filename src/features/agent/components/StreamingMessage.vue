<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

const props = defineProps<{
  content: string
}>()

const copy = ref<HTMLParagraphElement | null>(null)
let textNode: Text | null = null

onMounted(() => {
  textNode = document.createTextNode(props.content)
  copy.value?.appendChild(textNode)
})

watch(
  () => props.content,
  (content) => {
    if (!textNode) return
    if (content.startsWith(textNode.data)) {
      textNode.appendData(content.slice(textNode.data.length))
      return
    }
    textNode.data = content
  },
)
</script>

<template>
  <p ref="copy" class="streaming-message" data-testid="streaming-copy" />
</template>

<style scoped>
.streaming-message {
  margin: 0;
  color: var(--agent-cocoa);
  font-size: 15px;
  line-height: 1.7;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>
