using System.Text;
using Copernica.Attachments;

namespace Copernica.Tests.Attachments;

public sealed class ImageFormatTests
{
    public static TheoryData<string, string, string> Valid => new()
    {
        { "89504E470D0A1A0A0000000D49484452", "image/png", "png" },
        { "FFD8FFE000104A464946", "image/jpeg", "jpg" },
        { "474946383761010001", "image/gif", "gif" },
        { "474946383961010001", "image/gif", "gif" },
        { "524946462400000057454250565038", "image/webp", "webp" },
    };

    [Theory]
    [MemberData(nameof(Valid))]
    public void Binary_formats_are_detected_by_signature(string hex, string contentType, string extension)
    {
        var format = ImageFormat.Detect(Convert.FromHexString(hex));

        Assert.NotNull(format);
        Assert.Equal(contentType, format.ContentType);
        Assert.Equal(extension, format.Extension);
    }

    [Theory]
    [InlineData("<svg xmlns=\"http://www.w3.org/2000/svg\"/>")]
    [InlineData("﻿<svg/>")]
    [InlineData("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!-- drawn by hand -->\n  <SVG width=\"1\"></SVG>")]
    public void Svg_is_detected_when_its_first_element_is_svg(string text)
    {
        var format = ImageFormat.Detect(Encoding.UTF8.GetBytes(text));

        Assert.NotNull(format);
        Assert.Equal("image/svg+xml", format.ContentType);
        Assert.Equal("svg", format.Extension);
    }

    [Theory]
    [InlineData("<html><body><svg/></body></html>")]
    [InlineData("<?xml version=\"1.0\"?><script>alert(1)</script>")]
    [InlineData("Plain text")]
    [InlineData("")]
    public void Text_that_is_not_svg_is_rejected(string text)
    {
        Assert.Null(ImageFormat.Detect(Encoding.UTF8.GetBytes(text)));
    }

    [Theory]
    [InlineData("4D5A90000300000004000000")] // Windows executable renamed to .png
    [InlineData("89504E47")] // truncated PNG header
    [InlineData("52494646240000005741")] // RIFF that is not WebP
    [InlineData("FFD8")] // truncated JPEG
    public void Other_binaries_and_truncated_headers_are_rejected(string hex)
    {
        Assert.Null(ImageFormat.Detect(Convert.FromHexString(hex)));
    }

    [Fact]
    public void Invalid_utf8_is_not_svg()
    {
        Assert.Null(ImageFormat.Detect([0x3C, 0x73, 0x76, 0x67, 0xFF, 0xFE]));
    }
}
