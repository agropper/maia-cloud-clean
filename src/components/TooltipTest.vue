<template>
  <div class="tooltip-test">
    <h2>🔍 Vue Tooltip Test Component</h2>
    
    <div class="test-section">
      <h3>Test 1: Native HTML Title</h3>
      <span title="This is a native HTML tooltip">Hover over this text (native title)</span>
    </div>
    
    <div class="test-section">
      <h3>Test 2: CSS Hover Tooltip</h3>
      <div class="css-tooltip">
        <span>Hover over this text (CSS tooltip)</span>
        <div class="tooltip-content">This is a CSS-based tooltip</div>
      </div>
    </div>
    
    <div class="test-section">
      <h3>Test 3: Vue Reactive Tooltip</h3>
      <div 
        class="vue-tooltip"
        @mouseenter="showTooltip = true"
        @mouseleave="showTooltip = false"
      >
        <span>Hover over this text (Vue reactive)</span>
        <div v-show="showTooltip" class="tooltip-content">
          This is a Vue reactive tooltip
        </div>
      </div>
    </div>
    
    <div class="test-section">
      <h3>Test 4: Vue Computed Tooltip</h3>
      <div 
        class="vue-tooltip"
        @mouseenter="hoverState = true"
        @mouseleave="hoverState = false"
      >
        <span>Hover over this text (Vue computed)</span>
        <div v-show="hoverState" class="tooltip-content">
          This tooltip uses Vue computed properties
        </div>
      </div>
    </div>
    
    <div class="status">
      <p><strong>Current State:</strong></p>
      <ul>
        <li>showTooltip: {{ showTooltip }}</li>
        <li>hoverState: {{ hoverState }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const showTooltip = ref(false)
const hoverState = ref(false)
</script>

<style scoped>
.tooltip-test {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.test-section {
  background: white;
  padding: 20px;
  margin: 20px 0;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  border-left: 4px solid #1976d2;
}

.test-section h3 {
  margin-top: 0;
  color: #333;
}

.css-tooltip, .vue-tooltip {
  position: relative;
  display: inline-block;
  cursor: help;
  background: #f5f5f5;
  padding: 10px;
  border-radius: 4px;
}

.tooltip-content {
  position: absolute;
  bottom: 125%;
  left: 50%;
  transform: translateX(-50%);
  background-color: #333;
  color: white;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  white-space: nowrap;
  z-index: 1000;
  width: 200px;
  text-align: center;
}

.tooltip-content::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -5px;
  border-width: 5px;
  border-style: solid;
  border-color: #333 transparent transparent transparent;
}

.status {
  background: #e3f2fd;
  padding: 15px;
  border-radius: 6px;
  border-left: 4px solid #1976d2;
}

.status ul {
  margin: 10px 0;
  padding-left: 20px;
}

.status li {
  margin: 5px 0;
}
</style>
