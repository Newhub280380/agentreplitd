package cn.com.omnimind.bot.agent

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.coroutines.Dispatchers
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class BrowserUseRequestTest {
    @Test
    fun `screenshot accepts image reading when explicitly requested`() {
        val request = BrowserUseRequest.fromJson(
            buildJsonObject {
                put("tool_title", "Capture browser screenshot")
                put("action", "screenshot")
                put("read_image", true)
            },
        )

        assertTrue(request.readImage)
    }

    @Test
    fun `screenshot does not include image data by default`() {
        val request = BrowserUseRequest.fromJson(
            buildJsonObject {
                put("tool_title", "Capture browser screenshot")
                put("action", "screenshot")
            },
        )

        assertFalse(request.readImage)
    }

    @Test
    fun `preview image encoding is dispatched off the main thread`() {
        assertSame(Dispatchers.IO, BrowserPreviewEncodingPolicy.dispatcher)
    }
}