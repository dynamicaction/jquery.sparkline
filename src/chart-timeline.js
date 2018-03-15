  /*jslint nomen: true, plusplus: true, todo: true, white: true, browser: true *//**
     * Timeline sparkline chart
     * Given a list of events with begin/finish times, graph them vertically or horizontally by event type.
     * let events = [
     *  {begin:date(11a), finish:date(12a), color:'red'},
     *  {begin:date(12a), finish:date(1p), color:'green'},
     *  {begin:date(1p), finish:date(6p), color:'blue'}
     * ]
     * let 1 pixel = 1 minute
     * let 8 am be the sparkline begin
     * let 8 pm be the sparkline finish 
     * let 720 pixels be the total visible duration
     * then graph 
     *  |white for 300 pixels||red for 60 pixels||green for 60 pixels||blue for 300 pixels||white for 120 pixels|
     */
;(function ($) {

    "use strict";

    $.fn.sparkline.timeline = timeline = createClass($.fn.sparkline._base, barHighlightMixin, {

        type: 'timeline',

        init: function (el, values, options, width, height) {
            // expect a Date or the Number of milliseconds since the epoc
            function minutes(date) {
                return date / (60 * 1000);
            }
            // force positive number otherwise 0
            function forcePositiveNumber(val) {
                val = Math.abs(val);
                return isNaN(val) ? 0 : val;
            }
            var i, data, segment, beginMinutes, finishMinutes, durationMinutes, 
                pixelsPerMinute, userInitHandler, timeMarkPixels, isVerticalOrientation, 
                timeMarkInterval, timeMarkOffset, timeMark, tick, tickSize;
            timeline._super.init.call(this, el, values, options, width, height);
            // required by barHighlightMixin
            this.regionShapes = {};
            // sets canvas height/width
            this.initTarget();
            // holds each timeline entry with x,y,w,h,lc,fc,rd values
            this.segments = [];
            // holds time markers entry with x1,y1,x2,y2,lc,w values
            this.timemarks = [];
            // paints a 1px line showing full length of timeline
            timeMarkInterval = forcePositiveNumber(options.mergedOptions.timeMarkInterval);
            // orient the sparkline direction, the default is horizontal
            isVerticalOrientation = 'vertical' === options.mergedOptions.orientation;
            // allow user to manipulate the data before segment is built
            userInitHandler = $.isFunction(options.mergedOptions.init) ? options.mergedOptions.init : function (d) { return d; };
            function offset(date, baseline) {
                return Math.ceil(pixelsPerMinute * (minutes(date) - baseline));
            }
            // segments that fall outside of begin/finish will be clipped
            beginMinutes = minutes(options.mergedOptions.begin);
            finishMinutes = minutes(options.mergedOptions.finish);
            durationMinutes = (finishMinutes - beginMinutes);
            if (isVerticalOrientation) {
                pixelsPerMinute = (this.canvasHeight - 1) / durationMinutes;
            } else {
                pixelsPerMinute = (this.canvasWidth - 1) / durationMinutes;
            }
            if (timeMarkInterval > 0) {
                timeMarkPixels = timeMarkInterval * pixelsPerMinute;
                // add tick marks based on timeMarkInterval
                for (i = 0; i < ((durationMinutes * pixelsPerMinute) / timeMarkPixels) + 1; i++) {
                    tick = {x1: 0, y1: 0, x2: 0, y2: 0, lc:'#ff0011', w: 1};
                    timeMark = Math.round(i * timeMarkPixels);
                    tickSize = Math.ceil(timeMark / pixelsPerMinute) % 60 === 0 ? 3 : 1;
                    if (isVerticalOrientation) {
                        tick.x2 = tickSize;
                        tick.y1 = tick.y2 = timeMark;
                    } else {
                        tick.y2 = tickSize;
                        tick.x1 = tick.x2 = timeMark;
                    }
                    this.timemarks.push(tick);
                }
                // add last tick mark and timeline
                if (isVerticalOrientation) {
                    this.timemarks.push({x1:0, y1:0, x2:0, y2:this.canvasHeight, lc:'#eee', w:1});
                } else {
                    this.timemarks.push({x1:0, y1:0, x2:this.canvasWidth, y2:0, lc:'#eee', w:1});
                }
            }
            // build each segment for rendering
            timeMarkOffset = (timeMarkInterval > 0) ? 1 : 0;
            for (i = 0; i < values.length; i++) {
                // TODO: determine why values has bogus length value in IE8
                if (values[i]) {
                    data = userInitHandler(values[i], i);
                    if (data) {
                        // the minus 2 is to prevent clipping the segment
                        segment = {
                            x: timeMarkOffset, 
                            y: timeMarkOffset, 
                            w: width - (timeMarkOffset + 1), 
                            h: height - (timeMarkOffset + 1), 
                            data: data
                        };
                        // TODO: adjust shape size for overlapping regions
                        if (isVerticalOrientation) {
                            segment.y = offset(data.begin, beginMinutes);
                            segment.h = offset(data.finish, minutes(data.begin));
                        } else {
                            segment.x = offset(data.begin, beginMinutes);
                            segment.w = offset(data.finish, minutes(data.begin));
                        }
                        segment.fc = data.color || options.mergedOptions.fillColor;
                        segment.lc = data.lineColor || options.mergedOptions.lineColor;
                        this.segments.push(segment);
                    }
                }
            }

            // sort the segments so all segments are visible in timeline
            this.segments = this.segments.sort(function compare(a,b) {
                var ab, af, bb, bf;
                ab = Number(a.data.begin);
                bb = Number(b.data.begin);
                af = Number(a.data.finish);
                bf = Number(b.data.finish);
                // reverse order sort
                return (bb-ab) + (bf-af);
            });
        },

        /** return mouse coordinates on timeline */
        getRegion: function (el, x, y) {
            return {el: el, x: x, y: y};
        },

        /** return data used to display tooltip for the current region(s) */
        getCurrentRegionFields: function () {
            var i, el, x, y, segment, regions = [], left, right, top, bottom;
            el = this.currentRegion.el;
            x = this.currentRegion.x;
            y = this.currentRegion.y;
            for (i = 0; i < this.segments.length; i++) {
                segment = this.segments[i];
                if (segment) {
                    left = segment.x;
                    right = left + segment.w;
                    top = segment.y;
                    bottom = top + segment.h;
                    if (x > left && x < right && y > top && y < bottom) {
                        regions.push(segment.data);
                    }
                }
            }
            return regions;
        },

        /** render timeline segment and tickmarks */
        renderRegion: function (valuenum, highlight) {
            var i, tick, segment, result = [], target = this.target;
            if (valuenum === 0) {
                for (i = 0; i < this.timemarks.length; i++) {
                    tick = this.timemarks[i];
                    result.push(target.drawLine(tick.x1, tick.y1, tick.x2, tick.y2, tick.lc, tick.w));
                }
            }
            segment = this.segments[valuenum];
            if (segment) {
                result.push(target.drawRect(segment.x, segment.y, segment.w, segment.h, segment.lc, segment.fc));
            }
            return result;
        }
    });
}(jQuery));

